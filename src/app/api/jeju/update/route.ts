import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { calcNights, isJejuDateBookable, JEJU_MAX_NIGHTS_DEFAULT } from "@/lib/jeju";
import { writeAudit, getIp } from "@/lib/audit";
import { sendJejuNotification } from "@/lib/jejuNotify";

async function getBlockedDates(): Promise<string[]> {
  try {
    const c = await prisma.systemConfig.findUnique({ where: { key: "jejuBlockedDates" } });
    if (!c?.value) return [];
    const arr = JSON.parse(c.value);
    return Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function periodOverlapsBlocked(startDate: Date, endDate: Date, blocked: string[]): boolean {
  const set = new Set(blocked);
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (set.has(d.toISOString().slice(0, 10))) return true;
  }
  return false;
}

/**
 * 정정 처리
 *
 * - PENDING: 즉시 수정 가능
 * - STEP1_APPROVED: 1차 승인이 있었으므로 → PENDING으로 리셋, 1차 결재부터 재시작
 * - APPROVED(depositStatus=CONFIRMED): 입금 완료 상태이므로 → PENDING으로 리셋,
 *   depositStatus=CONFIRMED 유지 → 복지부 1차 승인 후 바로 최종 승인
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const body = await req.json();
  const {
    requestId,
    startDate: startStr,
    endDate: endStr,
    reason,
    guestName,
    guestPhone,
    guestCount,
    depositorName: depositorRaw,
  } = body as {
    requestId: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
    guestName?: string;
    guestPhone?: string;
    guestCount?: number;
    depositorName?: string;
  };

  if (!requestId) return NextResponse.json({ error: "requestId 필요" }, { status: 400 });

  const row = await prisma.jejuAccommodation.findUnique({
    where: { id: requestId },
    include: { employee: { select: { id: true, name: true, phone: true, alimtalkEnabled: true } } },
  });
  if (!row) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (row.employeeId !== user.employeeId) {
    return NextResponse.json({ error: "본인 신청만 수정할 수 있습니다." }, { status: 403 });
  }

  const allowedStatuses = ["PENDING", "STEP1_APPROVED", "APPROVED"];
  if (!allowedStatuses.includes(row.status)) {
    return NextResponse.json({ error: "반려·취소된 신청은 수정할 수 없습니다." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  let resetApproval = false;

  if (startStr != null && endStr != null) {
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    if (startDate >= endDate) {
      return NextResponse.json({ error: "제주도 숙소는 1박 이상(퇴실일이 입실일 다음 날 이상)만 선택할 수 있습니다." }, { status: 400 });
    }
    if (!isJejuDateBookable(startDate)) {
      return NextResponse.json({ error: "예약 시작일(입실일)은 매월 1일 기준 2달 후 말일까지만 선택 가능합니다." }, { status: 400 });
    }
    const blockedDates = await getBlockedDates();
    if (periodOverlapsBlocked(startDate, endDate, blockedDates)) {
      return NextResponse.json({ error: "선택한 기간 중 예약이 불가한 날짜가 포함되어 있습니다." }, { status: 400 });
    }
    const nights = calcNights(startDate, endDate);
    let maxNights = JEJU_MAX_NIGHTS_DEFAULT;
    const config = await prisma.systemConfig.findUnique({ where: { key: "jejuMaxNights" } });
    if (config?.value) {
      const n = parseInt(config.value, 10);
      if (!isNaN(n) && n >= 1) maxNights = n;
    }
    if (nights > maxNights) {
      return NextResponse.json({ error: `최대 연박은 ${maxNights}일입니다.` }, { status: 400 });
    }
    const overlapping = await prisma.jejuAccommodation.findFirst({
      where: {
        employeeId: user.employeeId,
        id: { not: requestId },
        status: { in: ["PENDING", "STEP1_APPROVED", "APPROVED"] },
        OR: [{ startDate: { lte: endDate }, endDate: { gte: startDate } }],
      },
    });
    if (overlapping) {
      return NextResponse.json({ error: "선택한 기간과 겹치는 다른 신청이 이미 있습니다." }, { status: 400 });
    }
    updates.startDate = startDate;
    updates.endDate = endDate;
    updates.nights = nights;
    resetApproval = true;
  }

  if (reason !== undefined) updates.reason = reason?.trim() || null;
  if (guestName !== undefined) updates.guestName = String(guestName).trim();
  if (guestPhone !== undefined) updates.guestPhone = String(guestPhone).trim();
  if (depositorRaw !== undefined) updates.depositorName = String(depositorRaw).trim();
  if (typeof guestCount === "number" && Number.isInteger(guestCount) && guestCount >= 1) {
    updates.guestCount = guestCount;
  }

  // 1차 이상 승인된 상태에서 정정 시 결재 리셋
  if (resetApproval && (row.status === "STEP1_APPROVED" || row.status === "APPROVED")) {
    // depositStatus=CONFIRMED 유지 (이미 입금된 경우 복지부 재승인 후 자동 최종 처리)
    updates.status = "PENDING";
    updates.step1ApproverId = null;
    updates.step1ApprovedAt = null;
    updates.approvedById = null;
    updates.approvedAt = null;
    updates.rejectComment = null;
    updates.rejectStep = null;
    // depositStatus는 유지 (CONFIRMED면 그대로, 아니면 NONE)
  }

  await prisma.jejuAccommodation.update({
    where: { id: requestId },
    data: updates as any,
    include: { employee: true },
  });

  await writeAudit({
    entityType: "JejuAccommodation", entityId: requestId, action: "UPDATED",
    actorId: user.employeeId, after: updates, ip: getIp(req) ?? undefined,
  });

  // 정정으로 리셋된 경우 1차 승인 요청 알림
  if (resetApproval && (row.status === "STEP1_APPROVED" || row.status === "APPROVED")) {
    const updatedRow = { ...row, ...updates } as typeof row;
    await sendJejuNotification(prisma, "step1_notify", null, updatedRow as any, 1).catch(console.warn);
  }

  return NextResponse.json({ ok: true });
}

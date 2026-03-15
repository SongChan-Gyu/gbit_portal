import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { calcNights, isJejuDateBookable, JEJU_MAX_NIGHTS_DEFAULT } from "@/lib/jeju";

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

/** 본인 신청만. PENDING일 때만 수정 가능. 이용일 변경 시에도 신청 시와 동일한 유효성 검사 적용(예약 한도·차단일·최대연박·중복 제외). */
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
  });
  if (!row) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (row.employeeId !== user.employeeId) {
    return NextResponse.json({ error: "본인 신청만 수정할 수 있습니다." }, { status: 403 });
  }
  if (row.status !== "PENDING") {
    return NextResponse.json({ error: "승인 대기 중인 신청만 수정할 수 있습니다. (승인/반려 후에는 수정 불가)" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (startStr != null && endStr != null) {
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    if (startDate > endDate) {
      return NextResponse.json({ error: "이용일이 올바르지 않습니다." }, { status: 400 });
    }
    if (!isJejuDateBookable(startDate)) {
      return NextResponse.json({
        error: "예약 시작일(입실일)은 매월 1일 기준 2달 후 말일까지만 선택 가능합니다.",
      }, { status: 400 });
    }
    const blockedDates = await getBlockedDates();
    if (periodOverlapsBlocked(startDate, endDate, blockedDates)) {
      return NextResponse.json({
        error: "선택한 기간 중 예약이 불가한 날짜가 포함되어 있습니다.",
      }, { status: 400 });
    }
    const nights = startStr === endStr ? 1 : Math.max(1, calcNights(startDate, endDate));
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
        status: { in: ["PENDING", "APPROVED"] },
        OR: [
          { startDate: { lte: endDate }, endDate: { gte: startDate } },
        ],
      },
    });
    if (overlapping) {
      return NextResponse.json({
        error: "선택한 기간과 겹치는 다른 신청이 이미 있습니다. 해당 신청을 취소하거나 다른 날짜를 선택해 주세요.",
      }, { status: 400 });
    }
    updates.startDate = startDate;
    updates.endDate = endDate;
    updates.nights = nights;
  }

  if (reason !== undefined) updates.reason = reason?.trim() || null;
  if (guestName !== undefined) updates.guestName = String(guestName).trim();
  if (guestPhone !== undefined) updates.guestPhone = String(guestPhone).trim();
  if (depositorRaw !== undefined) updates.depositorName = String(depositorRaw).trim();
  if (typeof guestCount === "number" && Number.isInteger(guestCount) && guestCount >= 1) {
    updates.guestCount = guestCount;
  }

  await prisma.jejuAccommodation.update({
    where: { id: requestId },
    data: updates as any,
  });

  return NextResponse.json({ ok: true });
}

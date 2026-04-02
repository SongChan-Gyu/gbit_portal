import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import { writeAudit, getIp } from "@/lib/audit";
import { sendJejuNotification } from "@/lib/jejuNotify";

/**
 * 1차 결재 (복지부) — PENDING → STEP1_APPROVED 또는 REJECTED
 * - 복지부(dutyDept=WELFARE) 또는 ADMIN만 처리 가능
 * - 정정으로 depositStatus=CONFIRMED 인 경우 1차 승인 시 바로 APPROVED로 전환
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  // 1차 결재권자: 복지부 or ADMIN
  if (user.role !== "ADMIN") {
    const emp = await prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { dutyDept: true },
    });
    if (!isWelfareDept(emp)) {
      return NextResponse.json({ error: "복지부 또는 관리자만 1차 승인/반려할 수 있습니다." }, { status: 403 });
    }
  }

  const body = await req.json();
  const { requestId, action, comment } = body as {
    requestId: string;
    action: "APPROVE" | "REJECT";
    comment?: string;
  };

  if (!requestId || !action) {
    return NextResponse.json({ error: "requestId, action 필요" }, { status: 400 });
  }
  if (action === "REJECT" && !comment?.trim()) {
    return NextResponse.json({ error: "반려 시 사유를 입력해 주세요." }, { status: 400 });
  }

  const row = await prisma.jejuAccommodation.findUnique({
    where: { id: requestId },
    include: { employee: { select: { id: true, name: true, phone: true, alimtalkEnabled: true } } },
  });
  if (!row) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "PENDING") {
    return NextResponse.json({ error: "1차 승인 대기 상태가 아닙니다." }, { status: 400 });
  }

  const now = new Date();

  if (action === "REJECT") {
    await prisma.jejuAccommodation.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        rejectStep: 1,
        rejectComment: comment?.trim() ?? null,
        step1ApproverId: user.employeeId,
        step1ApprovedAt: now,
      },
    });
    await writeAudit({
      entityType: "JejuAccommodation", entityId: requestId, action: "REJECTED",
      actorId: user.employeeId, after: { status: "REJECTED", step: 1 },
      note: `1차 반려: ${comment}`, ip: getIp(req) ?? undefined,
    });
    // 신청자에게 반려 알림
    await sendJejuNotification(prisma, "applicant_rejected", row.employee, row, 1).catch(console.warn);
    return NextResponse.json({ ok: true });
  }

  // APPROVE: depositStatus가 CONFIRMED(정정으로 재신청)이면 바로 최종 승인
  const alreadyDeposited = row.depositStatus === "CONFIRMED";
  const nextStatus = alreadyDeposited ? "APPROVED" : "STEP1_APPROVED";

  await prisma.jejuAccommodation.update({
    where: { id: requestId },
    data: {
      status: nextStatus,
      step1ApproverId: user.employeeId,
      step1ApprovedAt: now,
      // 이미 입금 확인된 경우 approvedBy도 갱신
      ...(alreadyDeposited ? { approvedById: user.employeeId, approvedAt: now } : {}),
    },
  });
  await writeAudit({
    entityType: "JejuAccommodation", entityId: requestId, action: "APPROVED",
    actorId: user.employeeId, after: { status: nextStatus },
    note: alreadyDeposited ? "1차 승인(입금 기확인, 최종 완료)" : "1차 승인",
    ip: getIp(req) ?? undefined,
  });

  // 신청자에게 1차 승인 알림 (최종이 아닌 경우)
  await sendJejuNotification(prisma, "applicant_step1_approved", row.employee, row, 1).catch(console.warn);

  // 2차 결재가 필요한 경우 PM에게 입금확인 요청 알림
  if (!alreadyDeposited) {
    await sendJejuNotification(prisma, "step2_notify", null, row, 2).catch(console.warn);
  }

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import { writeAudit, getIp } from "@/lib/audit";
import { sendJejuNotification } from "@/lib/jejuNotify";

/**
 * 취소 복지부 승인 (복지부/ADMIN)
 *
 * CANCEL_REQUESTED + depositStatus=NONE(STEP1_APPROVED에서 취소 요청)
 *   → APPROVE: CANCELLED (입금 없으므로 즉시 완료)
 *   → REJECT:  이전 상태(STEP1_APPROVED)로 복원
 *
 * CANCEL_REQUESTED + depositStatus=CONFIRMED(APPROVED에서 취소 요청)
 *   → APPROVE: CANCEL_STEP1_APPROVED (PM 입금취소 대기)
 *   → REJECT:  APPROVED로 복원
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  if (user.role !== "ADMIN") {
    const emp = await prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { dutyDept: true },
    });
    if (!isWelfareDept(emp)) {
      return NextResponse.json({ error: "복지부 또는 관리자만 취소 승인/반려할 수 있습니다." }, { status: 403 });
    }
  }

  const body = await req.json();
  const { requestId, action } = body as { requestId: string; action: "APPROVE" | "REJECT" };

  if (!requestId || !action) {
    return NextResponse.json({ error: "requestId, action 필요" }, { status: 400 });
  }

  const row = await prisma.jejuAccommodation.findUnique({
    where: { id: requestId },
    include: { employee: { select: { id: true, name: true, phone: true, alimtalkEnabled: true } } },
  });
  if (!row) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "CANCEL_REQUESTED") {
    return NextResponse.json({ error: "취소 요청 대기 상태가 아닙니다." }, { status: 400 });
  }

  const now = new Date();
  const depositConfirmed = row.depositStatus === "CONFIRMED";

  if (action === "APPROVE") {
    if (depositConfirmed) {
      // 입금이 있었으므로 PM 입금취소 처리 단계 필요
      await prisma.jejuAccommodation.update({
        where: { id: requestId },
        data: { status: "CANCEL_STEP1_APPROVED" },
      });
      await writeAudit({
        entityType: "JejuAccommodation", entityId: requestId, action: "CANCELLED",
        actorId: user.employeeId, after: { status: "CANCEL_STEP1_APPROVED" },
        note: "취소 복지부 승인 (PM 입금취소 대기)", ip: getIp(req) ?? undefined,
      });
      // PM에게 입금취소 처리 요청
      await sendJejuNotification(prisma, "cancel_step2_notify", null, row, 2).catch(console.warn);
    } else {
      // 입금 없음 → 즉시 취소 완료
      await prisma.jejuAccommodation.update({
        where: { id: requestId },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: row.cancelReason ? `${row.cancelReason} (취소 승인됨)` : "취소 승인",
        },
      });
      await writeAudit({
        entityType: "JejuAccommodation", entityId: requestId, action: "CANCELLED",
        actorId: user.employeeId, after: { status: "CANCELLED" }, ip: getIp(req) ?? undefined,
      });
      await sendJejuNotification(prisma, "applicant_cancelled", row.employee, row, 1).catch(console.warn);
    }
  } else {
    // REJECT: 취소 반려 → 이전 상태로 복원
    const restoreStatus = depositConfirmed ? "APPROVED" : "STEP1_APPROVED";
    await prisma.jejuAccommodation.update({
      where: { id: requestId },
      data: {
        status: restoreStatus,
        cancelRequestedAt: null,
        cancelReason: null,
      },
    });
    await writeAudit({
      entityType: "JejuAccommodation", entityId: requestId, action: "RESTORED",
      actorId: user.employeeId, after: { status: restoreStatus },
      note: "취소 요청 반려", ip: getIp(req) ?? undefined,
    });
  }

  return NextResponse.json({ ok: true });
}

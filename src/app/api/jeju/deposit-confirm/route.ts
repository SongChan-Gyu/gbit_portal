import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";
import { sendJejuNotification } from "@/lib/jejuNotify";

/**
 * 2차 처리 (PM) — 입금 확인(CONFIRM) 또는 입금 취소(CANCEL_DEPOSIT)
 *
 * CONFIRM: STEP1_APPROVED → APPROVED (입금확인 완료)
 * CANCEL_DEPOSIT: CANCEL_STEP1_APPROVED → CANCELLED (입금취소 처리 완료)
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  if (user.role !== "PM" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "PM 또는 관리자만 입금 처리할 수 있습니다." }, { status: 403 });
  }

  const body = await req.json();
  const { requestId, action } = body as {
    requestId: string;
    action: "CONFIRM" | "CANCEL_DEPOSIT";
  };

  if (!requestId || !action) {
    return NextResponse.json({ error: "requestId, action 필요" }, { status: 400 });
  }

  const row = await prisma.jejuAccommodation.findUnique({
    where: { id: requestId },
    include: { employee: { select: { id: true, name: true, phone: true, alimtalkEnabled: true } } },
  });
  if (!row) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });

  const now = new Date();

  if (action === "CONFIRM") {
    if (row.status !== "STEP1_APPROVED") {
      return NextResponse.json({ error: "1차 승인 완료 후 입금확인 가능합니다." }, { status: 400 });
    }
    await prisma.jejuAccommodation.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        depositStatus: "CONFIRMED",
        depositConfirmedById: user.employeeId,
        depositConfirmedAt: now,
        approvedById: user.employeeId,
        approvedAt: now,
      },
    });
    await writeAudit({
      entityType: "JejuAccommodation", entityId: requestId, action: "APPROVED",
      actorId: user.employeeId, after: { status: "APPROVED", depositStatus: "CONFIRMED" },
      note: "2차: 입금확인 완료", ip: getIp(req) ?? undefined,
    });
    await sendJejuNotification(prisma, "applicant_approved", row.employee, row, 2).catch(console.warn);
    return NextResponse.json({ ok: true });
  }

  if (action === "CANCEL_DEPOSIT") {
    if (row.status !== "CANCEL_STEP1_APPROVED") {
      return NextResponse.json({ error: "복지부 취소 승인 후 입금취소 처리가 가능합니다." }, { status: 400 });
    }
    await prisma.jejuAccommodation.update({
      where: { id: requestId },
      data: {
        status: "CANCELLED",
        depositStatus: "CANCELLED",
        cancelledAt: now,
      },
    });
    await writeAudit({
      entityType: "JejuAccommodation", entityId: requestId, action: "CANCELLED",
      actorId: user.employeeId, after: { status: "CANCELLED", depositStatus: "CANCELLED" },
      note: "입금취소 처리 완료", ip: getIp(req) ?? undefined,
    });
    await sendJejuNotification(prisma, "applicant_cancelled", row.employee, row, 2).catch(console.warn);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "알 수 없는 action" }, { status: 400 });
}

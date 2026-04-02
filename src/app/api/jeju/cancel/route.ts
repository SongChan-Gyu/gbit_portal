import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import { writeAudit, getIp } from "@/lib/audit";
import { sendJejuNotification } from "@/lib/jejuNotify";

/**
 * 취소 요청 처리
 *
 * PENDING: 본인 또는 복지부가 즉시 취소
 * STEP1_APPROVED: 취소 요청 → CANCEL_REQUESTED (복지부 취소승인 대기, 입금 없음)
 * APPROVED: 취소 요청 → CANCEL_REQUESTED (복지부 취소승인 + PM 입금취소 필요)
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const body = await req.json();
  const { requestId, reason } = body as { requestId: string; reason?: string };

  if (!requestId) return NextResponse.json({ error: "requestId 필요" }, { status: 400 });

  const row = await prisma.jejuAccommodation.findUnique({
    where: { id: requestId },
    include: { employee: { select: { id: true, name: true, phone: true, alimtalkEnabled: true } } },
  });
  if (!row) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });

  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true, role: true },
  });
  const welfare = isWelfareDept(emp) || emp?.role === "ADMIN";
  const isOwn = row.employeeId === user.employeeId;

  if (!isOwn && !welfare) {
    return NextResponse.json({ error: "본인 신청만 취소할 수 있습니다." }, { status: 403 });
  }

  if (row.status === "CANCELLED") {
    return NextResponse.json({ error: "이미 취소된 신청입니다." }, { status: 400 });
  }
  if (row.status === "REJECTED") {
    return NextResponse.json({ error: "반려된 신청입니다." }, { status: 400 });
  }
  if (row.status === "CANCEL_REQUESTED" || row.status === "CANCEL_STEP1_APPROVED") {
    if (isOwn && !welfare) {
      return NextResponse.json({ error: "이미 취소 요청 중입니다." }, { status: 400 });
    }
  }

  const now = new Date();

  // PENDING: 즉시 취소 가능
  if (row.status === "PENDING") {
    await prisma.jejuAccommodation.update({
      where: { id: requestId },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelReason: reason?.trim() || (welfare && !isOwn ? "복지부 취소 처리" : null),
      },
    });
    await writeAudit({
      entityType: "JejuAccommodation", entityId: requestId, action: "CANCELLED",
      actorId: user.employeeId, after: { status: "CANCELLED" }, ip: getIp(req) ?? undefined,
    });
    return NextResponse.json({ ok: true });
  }

  // STEP1_APPROVED: 입금 전이므로 취소 요청 → 복지부 취소 승인만 필요
  // APPROVED: 입금 후이므로 취소 요청 → 복지부 취소 승인 + PM 입금취소 필요
  // CANCEL_REQUESTED / CANCEL_STEP1_APPROVED: 복지부만 강제 취소 가능
  if (welfare && (row.status === "CANCEL_REQUESTED" || row.status === "CANCEL_STEP1_APPROVED")) {
    await prisma.jejuAccommodation.update({
      where: { id: requestId },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelReason: reason?.trim() || "복지부 취소 처리",
      },
    });
    await writeAudit({
      entityType: "JejuAccommodation", entityId: requestId, action: "CANCELLED",
      actorId: user.employeeId, after: { status: "CANCELLED" }, note: "복지부 직권 취소",
      ip: getIp(req) ?? undefined,
    });
    await sendJejuNotification(prisma, "applicant_cancelled", row.employee, row, 1).catch(console.warn);
    return NextResponse.json({ ok: true });
  }

  // 본인(또는 복지부) 취소 요청 → CANCEL_REQUESTED
  await prisma.jejuAccommodation.update({
    where: { id: requestId },
    data: {
      status: "CANCEL_REQUESTED",
      cancelRequestedAt: now,
      cancelReason: reason?.trim() || null,
    },
  });
  await writeAudit({
    entityType: "JejuAccommodation", entityId: requestId, action: "CANCELLED",
    actorId: user.employeeId, after: { status: "CANCEL_REQUESTED" }, note: "취소 요청",
    ip: getIp(req) ?? undefined,
  });
  // 복지부에게 취소 승인 요청 알림
  await sendJejuNotification(prisma, "cancel_step1_notify", null, row, 1).catch(console.warn);
  return NextResponse.json({ ok: true });
}

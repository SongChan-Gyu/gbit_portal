import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import { writeAudit, getIp } from "@/lib/audit";

/** 본인 신청 취소 또는 복지부가 타인 신청 취소 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const body = await req.json();
  const { requestId, reason } = body as { requestId: string; reason?: string };

  if (!requestId) return NextResponse.json({ error: "requestId 필요" }, { status: 400 });

  const row = await prisma.jejuAccommodation.findUnique({
    where: { id: requestId },
  });
  if (!row) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });

  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: { team: true },
  });
  const welfare = isWelfareDept(emp);
  const isOwn = row.employeeId === user.employeeId;

  if (!isOwn && !welfare) {
    return NextResponse.json({ error: "본인 신청만 취소할 수 있습니다." }, { status: 403 });
  }

  if (row.status === "CANCELLED") {
    return NextResponse.json({ error: "이미 취소된 신청입니다." }, { status: 400 });
  }

  if (row.status === "CANCEL_REQUESTED" && isOwn && !welfare) {
    return NextResponse.json({ error: "이미 취소 요청 중입니다. 복지부 승인을 기다려 주세요." }, { status: 400 });
  }

  const now = new Date();

  // 승인된 건: 본인은 취소 요청만 가능(CANCEL_REQUESTED). 복지부는 직권 취소 가능(CANCELLED).
  if (row.status === "APPROVED") {
    if (isOwn && !welfare) {
      await prisma.jejuAccommodation.update({
        where: { id: requestId },
        data: {
          status: "CANCEL_REQUESTED",
          cancelRequestedAt: now,
          cancelReason: reason?.trim() || null,
        },
      });
      await writeAudit({
        entityType: "JejuAccommodation",
        entityId: requestId,
        action: "CANCELLED",
        actorId: user.employeeId,
        after: { status: "CANCEL_REQUESTED" },
        note: "취소 요청",
        ip: getIp(req) ?? undefined,
      });
      return NextResponse.json({ ok: true });
    }
    if (welfare) {
      await prisma.jejuAccommodation.update({
        where: { id: requestId },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: reason?.trim() || (isOwn ? null : "복지부 취소 처리"),
        },
      });
      await writeAudit({
        entityType: "JejuAccommodation",
        entityId: requestId,
        action: "CANCELLED",
        actorId: user.employeeId,
        after: { status: "CANCELLED" },
        ip: getIp(req) ?? undefined,
      });
      return NextResponse.json({ ok: true });
    }
  }

  // PENDING: 본인 또는 복지부가 즉시 취소
  await prisma.$transaction(async (tx) => {
    await tx.jejuAccommodation.update({
      where: { id: requestId },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelReason: reason?.trim() || (welfare && !isOwn ? "복지부 취소 처리" : null),
      },
    });
  });
  await writeAudit({
    entityType: "JejuAccommodation",
    entityId: requestId,
    action: "CANCELLED",
    actorId: user.employeeId,
    after: { status: "CANCELLED" },
    ip: getIp(req) ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

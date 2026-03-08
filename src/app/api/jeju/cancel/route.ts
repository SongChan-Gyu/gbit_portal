import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";

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

  if (row.status === "APPROVED" && isOwn && !welfare) {
    return NextResponse.json({ error: "승인된 예약은 취소할 수 없습니다. 복지부에 문의하세요." }, { status: 403 });
  }

  if (row.status === "CANCELLED") {
    return NextResponse.json({ error: "이미 취소된 신청입니다." }, { status: 400 });
  }

  const now = new Date();
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

  return NextResponse.json({ ok: true });
}

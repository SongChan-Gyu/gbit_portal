import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  const { date } = await req.json();

  const lt = await prisma.leaveType.findUnique({ where: { code: "HEALING_DAY" } });
  if (!lt) return NextResponse.json({ error: "힐링데이 유형이 없습니다." }, { status: 404 });

  const stamps = await prisma.stampCoupon.findMany({
    where: { employeeId: user.employeeId, isUsed: false },
    orderBy: { stampDate: "asc" },
    take: 5,
  });
  if (stamps.length < 5)
    return NextResponse.json({ error: `스탬프 5개 필요 (현재 ${stamps.length}개)` }, { status: 400 });

  const targetDate = date ? new Date(date) : new Date();

  // 중복 체크
  const dup = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: user.employeeId,
      status: { notIn: ["CANCELLED", "WITHDRAWN"] },
      items: { some: { leaveTypeId: lt.id } },
      startDate: {
        gte: new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()),
        lt:  new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + 1),
      },
    },
  });
  if (dup) return NextResponse.json({ error: "해당 날짜에 이미 힐링데이가 신청되어 있습니다." }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    const reqRec = await tx.leaveRequest.create({
      data: {
        employeeId: user.employeeId,
        startDate: targetDate, endDate: targetDate,
        totalDays: 0,   // 휴가 일수 미차감
        reason: "힐링데이 (스탬프 5개 사용)",
        status: "APPROVED",  // 자동 승인
        currentStep: 0, totalSteps: 0,
      },
    });
    await tx.leaveRequestItem.create({
      data: {
        leaveRequestId: reqRec.id,
        leaveTypeId: lt.id,
        days: 0,
        startDate: targetDate, endDate: targetDate,
        reason: "힐링데이 (오후 4시 퇴근)",
      },
    });
    await tx.leaveHistory.create({
      data: {
        leaveRequestId: reqRec.id,
        action: "HEALING_DAY_APPLIED",
        actorId: user.employeeId,
        snapshot: JSON.stringify({ date: targetDate.toISOString().slice(0, 10), stampsUsed: 5 }),
      },
    });
    // 스탬프 5개 사용 처리
    for (const s of stamps) {
      await tx.stampCoupon.update({
        where: { id: s.id },
        data: { isUsed: true, usedForType: "HEALING_DAY", usedAt: new Date(), usedRequestId: reqRec.id },
      });
    }
  });

  return NextResponse.json({ ok: true });
}

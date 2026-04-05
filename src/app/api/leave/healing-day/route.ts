import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { findHealingStampCard } from "@/lib/stampCard";
import { addDaysYMD, todayKstYmd } from "@/lib/dateUtils";
import { kstMidnightFromYmd } from "@/lib/workdays";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  const { date } = await req.json();

  const lt = await prisma.leaveType.findUnique({ where: { code: "HEALING_DAY" } });
  if (!lt) return NextResponse.json({ error: "힐링데이 유형이 없습니다." }, { status: 404 });

  const dateYmd =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.slice(0, 10))
      ? date.slice(0, 10)
      : todayKstYmd();
  const targetDate = kstMidnightFromYmd(dateYmd);
  const nextDay = kstMidnightFromYmd(addDaysYMD(dateYmd, 1));

  // 중복 체크
  const dup = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: user.employeeId,
      status: { notIn: ["CANCELLED", "WITHDRAWN"] },
      items: { some: { leaveTypeId: lt.id } },
      startDate: {
        gte: targetDate,
        lt: nextDay,
      },
    },
  });
  if (dup) return NextResponse.json({ error: "해당 날짜에 이미 힐링데이가 신청되어 있습니다." }, { status: 400 });

  try {
  await prisma.$transaction(async (tx) => {
    const healCard = await findHealingStampCard(tx, user.employeeId);
    if (!healCard) throw new Error("NO_HEALING_SLOT");

    const reqRec = await tx.leaveRequest.create({
      data: {
        employeeId: user.employeeId,
        startDate: targetDate, endDate: targetDate,
        totalDays: 0,   // 휴가 일수 미차감
        reason: "힐링데이 (스탬프 장·힐링 권한 1회)",
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
        snapshot: JSON.stringify({
          date: dateYmd,
          stampCardId: healCard.id,
          healingSlot: true,
        }),
      },
    });
    const consumed = await tx.stampCard.updateMany({
      where: { id: healCard.id, healingUsed: false },
      data: { healingUsed: true, healingLeaveRequestId: reqRec.id },
    });
    if (consumed.count === 0) throw new Error("NO_HEALING_SLOT");
  });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_HEALING_SLOT") {
      return NextResponse.json(
        { error: "사용 가능한 힐링데이 권한이 없습니다. (같은 장에 스탬프 5칸 이상·힐링 미사용)" },
        { status: 400 },
      );
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}

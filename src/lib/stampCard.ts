import type { Prisma, PrismaClient } from "@prisma/client";

/** 휴가 취소·반려·철회 시 장 권한 + 구버전 쿠폰 used 복원 */
export async function releaseStampSlotsForLeaveRequest(
  tx: Prisma.TransactionClient,
  leaveRequestId: string,
) {
  await tx.stampCard.updateMany({
    where: { healingLeaveRequestId: leaveRequestId },
    data: { healingUsed: false, healingLeaveRequestId: null },
  });
  await tx.stampCard.updateMany({
    where: { afternoonLeaveRequestId: leaveRequestId },
    data: { afternoonUsed: false, afternoonLeaveRequestId: null },
  });
  await tx.stampCoupon.updateMany({
    where: { usedRequestId: leaveRequestId },
    data: { isUsed: false, usedForType: null, usedAt: null, usedRequestId: null },
  });
}

/** 팀장 승인 1건 → 현재 채우는 장에 칸 1 추가 */
export async function appendStampCouponToCard(
  tx: Prisma.TransactionClient,
  employeeId: string,
  stampDate: Date,
): Promise<{ stampId: string; stampCardId: string }> {
  let card = await tx.stampCard.findFirst({
    where: { employeeId, filledCount: { lt: 10 } },
    orderBy: { sortOrder: "desc" },
  });
  if (!card) {
    const agg = await tx.stampCard.aggregate({
      where: { employeeId },
      _max: { sortOrder: true },
    });
    const nextOrder = (agg._max.sortOrder ?? -1) + 1;
    card = await tx.stampCard.create({
      data: { employeeId, sortOrder: nextOrder, filledCount: 0 },
    });
  }
  const stamp = await tx.stampCoupon.create({
    data: { employeeId, stampDate, stampCardId: card.id },
  });
  await tx.stampCard.update({
    where: { id: card.id },
    data: { filledCount: { increment: 1 } },
  });
  return { stampId: stamp.id, stampCardId: card.id };
}

export async function findHealingStampCard(
  tx: Prisma.TransactionClient,
  employeeId: string,
) {
  return tx.stampCard.findFirst({
    where: {
      employeeId,
      filledCount: { gte: 5 },
      healingUsed: false,
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function findAfternoonStampCard(
  tx: Prisma.TransactionClient,
  employeeId: string,
) {
  return tx.stampCard.findFirst({
    where: {
      employeeId,
      filledCount: { gte: 10 },
      afternoonUsed: false,
    },
    orderBy: { sortOrder: "asc" },
  });
}

export function countHealingEligible(db: PrismaClient, employeeId: string) {
  return db.stampCard.count({
    where: { employeeId, filledCount: { gte: 5 }, healingUsed: false },
  });
}

export function countAfternoonEligible(db: PrismaClient, employeeId: string) {
  return db.stampCard.count({
    where: { employeeId, filledCount: { gte: 10 }, afternoonUsed: false },
  });
}

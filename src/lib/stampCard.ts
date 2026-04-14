import type { DB, DBTx } from "@/lib/db";

export const STAMP_CARD_TOTAL_SLOTS = 8;
export const HEALING_STAMP_THRESHOLD = 4;
export const AFTERNOON_STAMP_THRESHOLD = 8;

/** 휴가 취소·반려·철회 시 장 권한 + 구버전 쿠폰 used 복원 */
export async function releaseStampSlotsForLeaveRequest(
  tx: DBTx,
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
  tx: DBTx,
  employeeId: string,
  stampDate: Date,
): Promise<{ stampId: string; stampCardId: string }> {
  /** filledCount만 보면 실제 쿠폰 수와 어긋난 장에 11번째를 넣는 등 다건 부여 시 오류가 날 수 있어, 연결된 StampCoupon 개수로 판단 */
  const cards = await tx.stampCard.findMany({
    where: { employeeId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { stamps: true } } },
  });
  const sortedDesc = [...cards].sort((a, b) => b.sortOrder - a.sortOrder);
  const open = sortedDesc.find((c) => c._count.stamps < STAMP_CARD_TOTAL_SLOTS);

  let cardId: string;
  let stampsOnCard: number;

  if (open) {
    cardId = open.id;
    stampsOnCard = open._count.stamps;
  } else {
    const agg = await tx.stampCard.aggregate({
      where: { employeeId },
      _max: { sortOrder: true },
    });
    const nextOrder = (agg._max.sortOrder ?? -1) + 1;
    const created = await tx.stampCard.create({
      data: { employeeId, sortOrder: nextOrder, filledCount: 0 },
    });
    cardId = created.id;
    stampsOnCard = 0;
  }

  if (stampsOnCard >= STAMP_CARD_TOTAL_SLOTS) {
    throw new Error(`스탬프 장이 이미 ${STAMP_CARD_TOTAL_SLOTS}칸입니다.`);
  }

  const stamp = await tx.stampCoupon.create({
    data: { employeeId, stampDate, stampCardId: cardId },
  });
  await tx.stampCard.update({
    where: { id: cardId },
    data: { filledCount: stampsOnCard + 1 },
  });
  return { stampId: stamp.id, stampCardId: cardId };
}

export async function findHealingStampCard(
  tx: DBTx,
  employeeId: string,
) {
  return tx.stampCard.findFirst({
    where: {
      employeeId,
      filledCount: { gte: HEALING_STAMP_THRESHOLD },
      healingUsed: false,
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function findAfternoonStampCard(
  tx: DBTx,
  employeeId: string,
) {
  return tx.stampCard.findFirst({
    where: {
      employeeId,
      filledCount: { gte: AFTERNOON_STAMP_THRESHOLD },
      afternoonUsed: false,
    },
    orderBy: { sortOrder: "asc" },
  });
}

export function countHealingEligible(db: DB, employeeId: string) {
  return db.stampCard.count({
    where: { employeeId, filledCount: { gte: HEALING_STAMP_THRESHOLD }, healingUsed: false },
  });
}

export function countAfternoonEligible(db: DB, employeeId: string) {
  return db.stampCard.count({
    where: { employeeId, filledCount: { gte: AFTERNOON_STAMP_THRESHOLD }, afternoonUsed: false },
  });
}

/**
 * 기존 StampCoupon만 있고 StampCard가 비어 있을 때 1회 실행:
 * 사원별로 stampDate 오름차순 10개씩 묶어 장을 만들고, 사용 이력은 장 단위로 반영합니다.
 *
 *   npx tsx scripts/backfill-stamp-cards.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({ select: { id: true } });
  for (const { id: employeeId } of employees) {
    const existing = await prisma.stampCard.count({ where: { employeeId } });
    if (existing > 0) continue;

    const coupons = await prisma.stampCoupon.findMany({
      where: { employeeId },
      orderBy: { stampDate: "asc" },
    });
    if (coupons.length === 0) continue;

    let sortOrder = 0;
    for (let i = 0; i < coupons.length; i += 10) {
      const chunk = coupons.slice(i, i + 10);
      const healingUsed = chunk.some((c) => c.usedForType === "HEALING_DAY");
      const afternoonUsed = chunk.some((c) => c.usedForType === "PM_RECOG_STAMP");
      const healingLeaveRequestId =
        chunk.find((c) => c.usedForType === "HEALING_DAY")?.usedRequestId ?? null;
      const afternoonLeaveRequestId =
        chunk.find((c) => c.usedForType === "PM_RECOG_STAMP")?.usedRequestId ?? null;

      const card = await prisma.stampCard.create({
        data: {
          employeeId,
          sortOrder: sortOrder++,
          filledCount: chunk.length,
          healingUsed,
          afternoonUsed,
          healingLeaveRequestId,
          afternoonLeaveRequestId,
        },
      });

      for (const c of chunk) {
        await prisma.stampCoupon.update({
          where: { id: c.id },
          data: {
            stampCardId: card.id,
            isUsed: false,
            usedForType: null,
            usedAt: null,
            usedRequestId: null,
          },
        });
      }
    }

    console.log("backfill employee", employeeId, "cards", sortOrder);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

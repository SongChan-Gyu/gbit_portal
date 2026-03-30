/**
 * timeSlot 통합 이후 더 이상 쓰지 않는 오전/오후 분리 LeaveType 레코드를 DB에서 완전 삭제.
 *
 * 안전장치:
 * - CONFIRM_DELETE=DELETE_LEAVE_TYPE_VARIANTS 가 아니면 아무것도 하지 않음
 *
 * 실행:
 *   CONFIRM_DELETE=DELETE_LEAVE_TYPE_VARIANTS npx tsx scripts/delete-variant-leave-types.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONFIRM_VALUE = "DELETE_LEAVE_TYPE_VARIANTS";

const VARIANT_CODES = [
  "AM_HALF",
  "PM_HALF",
  "PUBLIC_AM",
  "PUBLIC_PM",
  "RECOGNITION_AM",
  "RECOGNITION_PM",
  "CARE_AM",
  "CARE_PM",
  "HOLIDAY_EXT_AM",
  "HOLIDAY_EXT_PM",
  "BIRTHDAY_HALF_AM",
] as const;

async function main() {
  const confirm = (process.env.CONFIRM_DELETE ?? "").trim();
  if (confirm !== CONFIRM_VALUE) {
    console.log(`[delete-variant-leave-types] skip: CONFIRM_DELETE=${confirm || "(empty)"} (expected ${CONFIRM_VALUE})`);
    return;
  }

  const variants = await prisma.leaveType.findMany({
    where: { code: { in: [...VARIANT_CODES] } },
    select: { id: true, code: true, isActive: true, name: true },
  });

  if (variants.length === 0) {
    console.log("[delete-variant-leave-types] nothing to delete");
    return;
  }

  const counts = await prisma.leaveRequestItem.groupBy({
    by: ["leaveTypeId"],
    _count: { _all: true },
  });
  const idToCount = new Map(counts.map((c) => [c.leaveTypeId, c._count._all]));

  for (const v of variants) {
    const c = idToCount.get(v.id) ?? 0;
    if (c > 0) {
      throw new Error(`[delete-variant-leave-types] blocked: ${v.code} still used by LeaveRequestItem (${c} rows)`);
    }
  }

  console.log("[delete-variant-leave-types] deleting:", variants.map((v) => v.code));
  await prisma.leaveType.deleteMany({ where: { id: { in: variants.map((v) => v.id) } } });
  console.log("[delete-variant-leave-types] DONE");
}

main()
  .catch((e) => {
    console.error("[delete-variant-leave-types] FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


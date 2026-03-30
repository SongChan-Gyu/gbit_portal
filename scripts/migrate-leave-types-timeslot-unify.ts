/**
 * 오전/오후/종일 분리 LeaveType(AM/PM variants)를 통합 LeaveType + timeSlot으로 실제 데이터 마이그레이션.
 *
 * 목표:
 * - LeaveRequestItem.leaveTypeId 를 통합 타입(ANNUAL/PUBLIC/...)으로 변경
 * - LeaveRequestItem.timeSlot 을 기존 variant 코드 기준으로 AM/PM으로 채움
 * - 기존 variant LeaveType 레코드는 비활성화(isActive=false) 처리
 *
 * 안전장치:
 * - CONFIRM_MIGRATE=UNIFY_LEAVE_TYPES 가 아니면 아무것도 하지 않음
 *
 * 실행:
 *   CONFIRM_MIGRATE=UNIFY_LEAVE_TYPES npx tsx scripts/migrate-leave-types-timeslot-unify.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONFIRM_VALUE = "UNIFY_LEAVE_TYPES";

type Mapping = {
  fromCode: string;
  toCode: string;
  timeSlot: "AM" | "PM";
};

const MAPPINGS: Mapping[] = [
  { fromCode: "AM_HALF", toCode: "ANNUAL", timeSlot: "AM" },
  { fromCode: "PM_HALF", toCode: "ANNUAL", timeSlot: "PM" },

  { fromCode: "PUBLIC_AM", toCode: "PUBLIC", timeSlot: "AM" },
  { fromCode: "PUBLIC_PM", toCode: "PUBLIC", timeSlot: "PM" },

  { fromCode: "RECOGNITION_AM", toCode: "RECOGNITION", timeSlot: "AM" },
  { fromCode: "RECOGNITION_PM", toCode: "RECOGNITION", timeSlot: "PM" },

  { fromCode: "CARE_AM", toCode: "CARE", timeSlot: "AM" },
  { fromCode: "CARE_PM", toCode: "CARE", timeSlot: "PM" },

  { fromCode: "HOLIDAY_EXT_AM", toCode: "HOLIDAY_EXT", timeSlot: "AM" },
  { fromCode: "HOLIDAY_EXT_PM", toCode: "HOLIDAY_EXT", timeSlot: "PM" },

  { fromCode: "BIRTHDAY_HALF_AM", toCode: "BIRTHDAY_HALF", timeSlot: "AM" },
];

async function main() {
  const confirm = (process.env.CONFIRM_MIGRATE ?? "").trim();
  if (confirm !== CONFIRM_VALUE) {
    console.log(`[migrate-leave-types-timeslot-unify] skip: CONFIRM_MIGRATE=${confirm || "(empty)"} (expected ${CONFIRM_VALUE})`);
    return;
  }

  const fromCodes = MAPPINGS.map((m) => m.fromCode);
  const toCodes = [...new Set(MAPPINGS.map((m) => m.toCode))];

  const [fromTypes, toTypes] = await Promise.all([
    prisma.leaveType.findMany({ where: { code: { in: fromCodes } }, select: { id: true, code: true, isActive: true, name: true } }),
    prisma.leaveType.findMany({ where: { code: { in: toCodes } }, select: { id: true, code: true, isActive: true, name: true } }),
  ]);

  const fromByCode = new Map(fromTypes.map((t) => [t.code, t]));
  const toByCode = new Map(toTypes.map((t) => [t.code, t]));

  for (const m of MAPPINGS) {
    if (!fromByCode.get(m.fromCode)) {
      console.warn(`[migrate] missing from LeaveType: ${m.fromCode} (skip mapping)`);
    }
    if (!toByCode.get(m.toCode)) {
      throw new Error(`[migrate] missing to LeaveType: ${m.toCode} (required)`);
    }
  }

  console.log("[migrate] START");
  console.log("[migrate] mappings:", MAPPINGS);

  const beforeCounts: Record<string, number> = {};
  for (const m of MAPPINGS) {
    const from = fromByCode.get(m.fromCode);
    if (!from) continue;
    beforeCounts[m.fromCode] = await prisma.leaveRequestItem.count({ where: { leaveTypeId: from.id } });
  }
  console.log("[migrate] items(before):", beforeCounts);

  await prisma.$transaction(async (tx) => {
    for (const m of MAPPINGS) {
      const from = fromByCode.get(m.fromCode);
      const to = toByCode.get(m.toCode)!;
      if (!from) continue;

      // 1) LeaveRequestItem: leaveTypeId -> 통합 타입, timeSlot -> AM/PM (기존 값이 있으면 유지)
      await tx.leaveRequestItem.updateMany({
        where: { leaveTypeId: from.id },
        data: {
          leaveTypeId: to.id,
          timeSlot: m.timeSlot,
        },
      });

      // 2) variant LeaveType 비활성화
      await tx.leaveType.update({
        where: { id: from.id },
        data: { isActive: false },
      });
    }
  });

  const afterCounts: Record<string, number> = {};
  for (const m of MAPPINGS) {
    const to = toByCode.get(m.toCode)!;
    afterCounts[m.toCode] = await prisma.leaveRequestItem.count({ where: { leaveTypeId: to.id } });
  }
  console.log("[migrate] items(after, by toCode):", afterCounts);
  console.log("[migrate] DONE");
}

main()
  .catch((e) => {
    console.error("[migrate-leave-types-timeslot-unify] FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


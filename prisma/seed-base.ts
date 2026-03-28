/**
 * 기초데이터만 시드: 휴가유형 + 공휴일(API 동기화)
 * - 사원·할당·신청 내역 등은 건드리지 않음.
 * - 기존 DB에 사원정보/휴가 부여·사용 내역만 있을 때, 휴일/휴가유형만 갱신하려면 이 스크립트 사용.
 *
 * approvalSteps(결재 단계): 연차·연차반차·돌봄·연휴연장은 팀장 1단(1). 공가·병가·인정·경조·포상 등은 PM까지 2단(2).
 *   스탬프·하프데이·생일반차·근속 등은 1단. 힐링데이(스탬프 적립형)는 0.
 *
 * 실행: npx ts-node --transpile-only prisma/seed-base.ts
 * 또는: npm run db:seed:base
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedLeaveTypes() {
  const types = [
    ["ANNUAL", "연차", 1, true, 1, null, null, false, null, false, false, false, "귀속연도", null, "#3b82f6", 0],
    ["AM_HALF", "연차(오전반차)", 0.5, true, 1, null, null, false, null, true, true, false, "귀속연도", null, "#6366f1", 1],
    ["PM_HALF", "연차(오후반차)", 0.5, true, 1, null, null, false, null, true, false, true, "귀속연도", null, "#6366f1", 2],
    ["CONDOLENCE", "경조휴가", 1, false, 2, null, null, false, null, false, false, false, "부여일기준", null, "#f59e0b", 3],
    ["CARE", "돌봄휴가", 1, false, 1, null, 2, false, null, false, false, false, "귀속연도", null, "#10b981", 4],
    ["CARE_AM", "오전 돌봄휴가", 0.5, false, 1, null, null, false, null, true, true, false, "귀속연도", null, "#10b981", 5],
    ["CARE_PM", "오후 돌봄휴가", 0.5, false, 1, null, null, false, null, true, false, true, "귀속연도", null, "#10b981", 6],
    ["PUBLIC", "공가", 1, false, 2, null, null, false, null, false, false, false, "귀속연도", null, "#64748b", 7],
    ["PUBLIC_AM", "오전 공가", 0.5, false, 2, null, null, false, null, true, true, false, "귀속연도", null, "#64748b", 8],
    ["PUBLIC_PM", "오후 공가", 0.5, false, 2, null, null, false, null, true, false, true, "귀속연도", null, "#64748b", 9],
    ["RECOGNITION", "인정휴가", 1, false, 2, null, null, false, null, false, false, false, "귀속연도", null, "#64748b", 10],
    ["RECOGNITION_AM", "오전 인정휴가", 0.5, false, 2, null, null, false, null, true, true, false, "귀속연도", null, "#64748b", 11],
    ["RECOGNITION_PM", "오후 인정휴가", 0.5, false, 2, null, null, false, null, true, false, true, "귀속연도", null, "#64748b", 12],
    ["PM_HALF_MONTH", "하프데이", 0.5, false, 1, 1, null, false, null, true, false, true, "귀속연도", null, "#0ea5e9", 13],
    ["SICK", "병가", 1, false, 2, null, null, false, null, false, false, false, "귀속연도", null, "#ef4444", 14],
    ["HEALING_DAY", "힐링데이", 0, false, 0, null, null, true, 5, false, false, false, "부여일기준", null, "#f59e0b", 15],
    ["PM_RECOG_STAMP", "오후인정(스탬프)", 0.5, false, 1, null, null, true, 10, true, false, true, "부여일기준", null, "#a855f7", 16],
    ["TENURE_1Y", "1년근속휴가", 1, false, 1, null, null, false, null, false, false, false, "입사일기준", 12, "#10b981", 17],
    ["TENURE_5Y", "5년근속휴가", 1, false, 1, null, null, false, null, false, false, false, "입사일기준", 12, "#10b981", 18],
    ["TENURE_10Y", "10년근속휴가", 1, false, 1, null, null, false, null, false, false, false, "입사일기준", 12, "#10b981", 19],
    ["AWARD", "포상휴가", 1, false, 2, null, null, false, null, false, false, false, "부여일기준", 12, "#f59e0b", 20],
    ["HOLIDAY_EXT", "연휴연장휴가", 1, false, 1, null, null, false, null, false, false, false, "귀속연도", null, "#0ea5e9", 21],
    ["BIRTHDAY_HALF", "생일반차", 0.5, false, 1, null, null, false, null, true, false, true, "부여일기준", 12, "#ec4899", 22],
  ] as const;

  function allocationSourceForCode(code: string): string | null {
    if (["CARE", "CARE_AM", "CARE_PM"].includes(code)) return "CARE";
    if (code === "HOLIDAY_EXT") return "HOLIDAY_EXT";
    if (code === "BIRTHDAY_HALF") return "BIRTHDAY_HALF";
    if (code === "AWARD") return "AWARD";
    return null;
  }

  for (const [code, name, dpu, deduct, steps, maxMon, maxYr, stamp, stampCnt, isHalf, amOnly, pmOnly, vBasis, vMon, color, sort] of types) {
    const data = {
      name,
      daysPerUnit: dpu as number,
      deductFromBalance: deduct as boolean,
      approvalSteps: steps as number,
      maxPerMonth: maxMon as number | null,
      maxPerYear: maxYr as number | null,
      requiresStamp: stamp as boolean,
      stampCount: stampCnt as number | null,
      allocationSourceCode: allocationSourceForCode(code),
      isHalf: isHalf as boolean,
      isAmOnly: amOnly as boolean,
      isPmOnly: pmOnly as boolean,
      validityBasis: vBasis as string,
      validityMonths: vMon as number | null,
      color,
      sortOrder: sort as number,
    };
    await prisma.leaveType.upsert({
      where: { code },
      update: data,
      create: { code, ...data },
    });
  }
  console.log("  ✅ 휴가유형 upsert 완료");
}

async function main() {
  console.log("🌱 기초데이터만 시드 (휴가유형 + 공휴일 API 동기화)...");

  const { syncHolidaysToDb, getHolidayYearRange } = await import("../src/lib/holidays");
  const range = getHolidayYearRange();
  const hResult = await syncHolidaysToDb(prisma, range.fromYear, range.toYear);
  if (hResult.failed) console.warn("  ⚠ 휴일 API 동기화 실패:", hResult.failed);
  else console.log("  ✅ 휴일 동기화:", hResult.synced, "건");

  await seedLeaveTypes();

  console.log("✅ 기초데이터 시드 완료 (사원/할당/신청 내역은 변경 없음)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

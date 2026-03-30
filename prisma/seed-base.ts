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
  const { APPLY_GROUP_BY_CODE } = await import("../src/lib/leaveApplyGroups");
  const types = [
    ["ANNUAL", "연차", 1, true, 1, null, null, false, null, false, false, false, "귀속연도", null, "#3b82f6", 0],
    ["CONDOLENCE", "경조휴가", 1, false, 2, null, null, false, null, false, false, false, "부여일기준", null, "#f59e0b", 3],
    ["CARE", "돌봄휴가", 1, false, 1, null, 2, false, null, false, false, false, "귀속연도", null, "#10b981", 4],
    ["PUBLIC", "공가", 1, false, 2, null, null, false, null, false, false, false, "귀속연도", null, "#64748b", 7],
    ["RECOGNITION", "인정휴가", 1, false, 2, null, null, false, null, false, false, false, "귀속연도", null, "#64748b", 10],
    ["PM_HALF_MONTH", "하프데이", 0.5, false, 1, 1, null, false, null, true, false, true, "귀속연도", null, "#0ea5e9", 13],
    ["SICK", "병가", 1, false, 2, null, null, false, null, false, false, false, "귀속연도", null, "#ef4444", 14],
    ["HEALING_DAY", "힐링데이", 0, false, 0, null, null, true, 5, false, false, false, "부여일기준", null, "#f59e0b", 15],
    ["PM_RECOG_STAMP", "오후인정(스탬프)", 0.5, false, 1, null, null, true, 10, true, false, true, "부여일기준", null, "#a855f7", 16],
    ["TENURE_1Y", "1년근속휴가", 1, false, 1, null, null, false, null, false, false, false, "귀속연도", null, "#10b981", 17],
    ["TENURE_5Y", "5년근속휴가", 1, false, 1, null, null, false, null, false, false, false, "입사일기준", 12, "#10b981", 18],
    ["TENURE_10Y", "10년근속휴가", 1, false, 1, null, null, false, null, false, false, false, "입사일기준", 12, "#10b981", 19],
    ["AWARD", "포상휴가", 1, false, 2, null, null, false, null, false, false, false, "부여일기준", 12, "#f59e0b", 20],
    ["HOLIDAY_EXT", "연휴연장휴가", 1, false, 1, null, null, false, null, false, false, false, "귀속연도", null, "#0ea5e9", 21],
    ["BIRTHDAY_HALF", "생일반차", 0.5, false, 1, null, null, false, null, true, false, true, "부여일기준", 12, "#ec4899", 25],
  ] as const;

  const DUAL_TIME_SLOT_CODES = new Set([
    "ANNUAL",
    "PUBLIC",
    "RECOGNITION",
    "CARE",
    "HOLIDAY_EXT",
  ]);

  function allocationSourceForCode(code: string): string | null {
    if (code === "CARE") return "CARE";
    if (code === "HOLIDAY_EXT") return "HOLIDAY_EXT";
    if (code === "BIRTHDAY_HALF") return "BIRTHDAY_HALF";
    if (code === "TENURE_1Y" || code === "TENURE_5Y" || code === "TENURE_10Y") return code;
    if (code === "AWARD") return "AWARD";
    return null;
  }

  for (const [code, name, dpu, deduct, steps, maxMon, maxYr, stamp, stampCnt, isHalf, amOnly, pmOnly, vBasis, vMon, color, sort] of types) {
    let half = !!(isHalf as boolean);
    let allowsFullDay = !half;
    let allowsHalfDay = half;
    let halfDayAmPm = !half
      ? "BOTH"
      : (amOnly as boolean)
        ? "AM_ONLY"
        : (pmOnly as boolean)
          ? "PM_ONLY"
          : "BOTH";

    // 시간대 통합(오전/오후/종일)용 정책: timeSlot로만 AM/PM/FULL을 구분
    if (DUAL_TIME_SLOT_CODES.has(code)) {
      half = false;
      allowsFullDay = true;
      allowsHalfDay = true;
      halfDayAmPm = "BOTH";
    }
    // 생일반차는 half-only + AM/PM 선택 (type은 하나, timeSlot로만 구분)
    if (code === "BIRTHDAY_HALF") {
      half = true;
      allowsFullDay = false;
      allowsHalfDay = true;
      halfDayAmPm = "BOTH";
    }
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
      allowsFullDay,
      allowsHalfDay,
      halfDayAmPm,
      applyGroupKey: APPLY_GROUP_BY_CODE[code] ?? null,
      isHalf: half,
      isAmOnly: code === "BIRTHDAY_HALF" ? false : (amOnly as boolean),
      isPmOnly: code === "BIRTHDAY_HALF" ? false : (pmOnly as boolean),
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

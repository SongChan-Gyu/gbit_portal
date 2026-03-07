/**
 * 연차 일수 계산 (귀속연도 기준)
 * - 1년 미만: 월별 1일씩 (별도 처리)
 * - 정규직: 기본 15 + 2년마다 1일 추가, 최대 25일
 * - 프리랜서: 항상 15일
 */
export function calcAnnualDays(hireDate: Date, fiscalYearStart: Date, employeeType = "FULL"): number {
  if (employeeType !== "FULL") return 15;

  const ms = fiscalYearStart.getTime() - hireDate.getTime();
  const yearsOfService = Math.floor(ms / (365.25 * 24 * 3600 * 1000));
  if (yearsOfService < 1) return 0; // 월별 발생

  const base  = 15;
  const bonus = Math.min(Math.floor(yearsOfService / 2), 10); // 2년마다 +1, 최대 +10
  return Math.min(base + bonus, 25);
}

/**
 * 근속 마일스톤 체크: 특정 귀속연도에 1/5/10년 근속이 해당하는지
 * 귀속연도 내(fyStart ~ fyEnd)에 N주년 기념일이 있으면 해당 근속휴가를 부여
 */
export function getTenureMilestones(
  hireDate: Date,
  fyStart: Date,  // e.g. 2025-05-01
  fyEnd:   Date,  // e.g. 2026-04-30
): { years: number; label: string; days: number; code: string; grantDate: Date }[] {
  const milestones: { years: number; label: string; days: number; code: string }[] = [
    { years: 1,  label: "1년근속휴가",  days: 3,  code: "TENURE_1Y"  },
    { years: 5,  label: "5년근속휴가",  days: 5,  code: "TENURE_5Y"  },
    { years: 10, label: "10년근속휴가", days: 10, code: "TENURE_10Y" },
  ];

  return milestones
    .map((m) => {
      const anniversary = new Date(hireDate);
      anniversary.setFullYear(hireDate.getFullYear() + m.years);
      if (anniversary >= fyStart && anniversary <= fyEnd) {
        return { ...m, grantDate: anniversary };
      }
      return null;
    })
    .filter(Boolean) as any[];
}

/** 귀속연도 시작/종료일 */
export function fiscalPeriod(fy: number): { start: Date; end: Date } {
  return {
    start: new Date(`${fy}-05-01`),
    end:   new Date(`${fy+1}-04-30`),
  };
}

/** 월 약자 */
export const MONTH_LABELS = ["5월","6월","7월","8월","9월","10월","11월","12월","1월","2월","3월","4월"];

/** 귀속연도 내 날짜의 "월 인덱스" (0=5월, 11=4월) */
export function fiscalMonthIndex(date: Date, fy: number): number {
  const m = date.getMonth() + 1;
  return m >= 5 ? m - 5 : m + 7;
}

/** 근속 마일스톤 설정 타입 (AllocationSourceConfig 기반) */
export interface TenureMilestoneConfig {
  years: number;
  code:  string;
  label: string;
  days:  number;
}

/** 기본연차·가산 규칙 설정 타입 (AllocationSourceConfig 기반) */
export interface AnnualLeaveConfig {
  baseDays:          number; // 기본 연차 일수 (e.g. 15)
  bonusIntervalYears: number; // 가산 기준 연수 (e.g. 2 = 2년마다 +1)
  bonusMaxDays:      number; // 가산 최대 일수 (e.g. 10)
}

/** fallback: DB 조회 실패 시 사용하는 기본값 */
export const DEFAULT_ANNUAL_CONFIG: AnnualLeaveConfig = {
  baseDays: 15,
  bonusIntervalYears: 2,
  bonusMaxDays: 10,
};

/** fallback: DB 조회 실패 시 사용하는 기본 마일스톤 목록 */
export const DEFAULT_TENURE_MILESTONES: TenureMilestoneConfig[] = [
  { years: 1,  label: "1년근속휴가",  days: 3,  code: "TENURE_1Y"  },
  { years: 5,  label: "5년근속휴가",  days: 5,  code: "TENURE_5Y"  },
  { years: 10, label: "10년근속휴가", days: 10, code: "TENURE_10Y" },
];

/**
 * 연차 일수 계산 (귀속연도 기준)
 * - 1년 미만: 0 반환 (월별 1일씩 별도 처리)
 * - 프리랜서(FREE): baseDays 고정 (근속가산 없음)
 * - config를 생략하면 DEFAULT_ANNUAL_CONFIG 사용 (폴백용, 운영에서는 DB 조회값 전달 권장)
 */
export function calcAnnualDays(
  hireDate: Date,
  fiscalYearStart: Date,
  employeeType = "FULL",
  config: AnnualLeaveConfig = DEFAULT_ANNUAL_CONFIG,
): number {
  const { baseDays, bonusIntervalYears, bonusMaxDays } = config;
  if (employeeType !== "FULL") return baseDays;

  const ms = fiscalYearStart.getTime() - hireDate.getTime();
  const yearsOfService = Math.floor(ms / (365.25 * 24 * 3600 * 1000));
  if (yearsOfService < 1) return 0; // 월별 발생

  const bonus = bonusIntervalYears > 0
    ? Math.min(Math.floor(yearsOfService / bonusIntervalYears), bonusMaxDays)
    : 0;
  return baseDays + bonus;
}

/**
 * 근속 마일스톤 체크: 특정 귀속연도에 해당하는 근속 기념일 반환
 * - milestoneConfigs를 생략하면 DEFAULT_TENURE_MILESTONES 사용 (폴백용, 운영에서는 DB 조회값 전달 권장)
 */
export function getTenureMilestones(
  hireDate: Date,
  fyStart: Date,
  fyEnd:   Date,
  milestoneConfigs: TenureMilestoneConfig[] = DEFAULT_TENURE_MILESTONES,
): { years: number; label: string; days: number; code: string; grantDate: Date }[] {
  return milestoneConfigs
    .map((m) => {
      const anniversary = new Date(hireDate);
      anniversary.setFullYear(hireDate.getFullYear() + m.years);
      if (anniversary >= fyStart && anniversary <= fyEnd) {
        return { ...m, grantDate: anniversary };
      }
      return null;
    })
    .filter(Boolean) as { years: number; label: string; days: number; code: string; grantDate: Date }[];
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

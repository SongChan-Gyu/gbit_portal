import { addCalendarYearsToYmd, kstYmd } from "./dateUtils";
import { kstMidnight } from "./workdays";

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

/** 근속 마일스톤 자동 부여 시 note 통일 (중복 판정·표시용) */
export function formatTenureMilestoneAutoNote(anniversaryYmd: string, years: number): string {
  return `${anniversaryYmd} 자동 부여 (입사 ${years}년 근속)`;
}

/**
 * 폴백: 테스트·로컬 스크립트·DB에 마일스톤 행이 전혀 없을 때만.
 * 운영 부여 일수는 `LeaveType`(`daysPerUnit`+`hireAnniversaryYears`) 또는 `AllocationSourceConfig.defaultDays`가 단일 기준.
 */
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
 * - grantDate·anniversaryYmd는 kstYmd·달력 주년 기준으로 통일 (UTC ISO 시프트 방지)
 */
export function getTenureMilestones(
  hireDate: Date,
  fyStart: Date,
  fyEnd:   Date,
  milestoneConfigs: TenureMilestoneConfig[] = DEFAULT_TENURE_MILESTONES,
): { years: number; label: string; days: number; code: string; grantDate: Date; anniversaryYmd: string }[] {
  const hireYmd = kstYmd(hireDate);
  const fyStartYmd = kstYmd(fyStart);
  const fyEndYmd = kstYmd(fyEnd);
  return milestoneConfigs
    .map((m) => {
      const anniversaryYmd = addCalendarYearsToYmd(hireYmd, m.years);
      if (anniversaryYmd < fyStartYmd || anniversaryYmd > fyEndYmd) return null;
      const [yy, mm, dd] = anniversaryYmd.split("-").map(Number);
      const grantDate = kstMidnight(yy, mm, dd);
      return { ...m, grantDate, anniversaryYmd };
    })
    .filter(Boolean) as { years: number; label: string; days: number; code: string; grantDate: Date; anniversaryYmd: string }[];
}

/**
 * 귀속연도 시작/종료 (한국 달력 고정, 서버 TZ 무관).
 * Prisma·화면에서 validFrom/validUntil 비교 시 동일 기준으로 겹침 판정되도록 +09:00 명시.
 */
export function fiscalPeriod(fy: number): { start: Date; end: Date } {
  return {
    start: new Date(`${fy}-05-01T00:00:00.000+09:00`),
    end: new Date(`${fy + 1}-04-30T23:59:59.999+09:00`),
  };
}

/** 월 약자 */
export const MONTH_LABELS = ["5월","6월","7월","8월","9월","10월","11월","12월","1월","2월","3월","4월"];

/** 귀속연도 내 날짜의 "월 인덱스" (0=5월, 11=4월) — KST 달력 */
export function fiscalMonthIndex(date: Date, _fy: number): number {
  const m = parseInt(kstYmd(date).slice(5, 7), 10);
  return m >= 5 ? m - 5 : m + 7;
}

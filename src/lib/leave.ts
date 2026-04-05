/**
 * 휴가 관련 비즈니스 로직
 */

import { kstYmd } from "./dateUtils";
import { fiscalPeriod } from "./leaveCalc";
import { calcWorkingDays as calcWorkingDaysYmd } from "./workdays";

export { getFiscalYear } from "./workdays";

/** 귀속연도 기간 (KST +09:00 고정, leaveCalc.fiscalPeriod와 동일) */
export function getFiscalPeriod(fiscalYear: number) {
  return fiscalPeriod(fiscalYear);
}

/** 영업일 수 (Date 구간 → KST 달력 YMD 후 `@/lib/workdays`와 동일 로직) */
export function calcWorkingDays(start: Date, end: Date, holidays: Date[]): number {
  const holidayYmds = holidays.map((h) => kstYmd(h));
  return calcWorkingDaysYmd(kstYmd(start), kstYmd(end), holidayYmds);
}

/** 날짜 포맷 YYYY-MM-DD (KST 달력일) */
export function formatDate(date: Date): string {
  return kstYmd(date);
}

/** 귀속연도 표시 문자열 */
export function fiscalYearLabel(fy: number): string {
  return `${fy}.05 ~ ${fy + 1}.04`;
}

/** 역할 한글 */
export const ROLE_LABELS: Record<string, string> = {
  STAFF: "직원",
  TEAM_LEAD: "팀장",
  PM: "PM",
  ADMIN: "관리자",
};

/** 직급 한글 정렬 순서 */
export const POSITION_ORDER = ["이사", "부장", "차장", "과장", "대리", "사원"];

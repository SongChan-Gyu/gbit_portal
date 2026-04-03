import { mergePublicHolidayYmds } from "@/lib/holidays";

/** 달력에서 공휴일·일요일 강조 색 */
export const CALENDAR_HOLIDAY_COLOR = "#c62828";

/** DB 공휴일 YMD 목록 → 표시용 Set (보강 대체공휴일 포함) */
export function buildHolidayDisplaySet(dbYmds: string[]): Set<string> {
  return mergePublicHolidayYmds(dbYmds);
}

export function isSundayYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d).getDay() === 0;
}

/** 공휴일 또는 일요일이면 달력에서 빨간색 처리 */
export function isRedCalendarDay(ymd: string, holidaySet: Set<string>): boolean {
  return holidaySet.has(ymd) || isSundayYmd(ymd);
}

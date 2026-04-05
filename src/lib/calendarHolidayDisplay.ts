import { mergePublicHolidayYmds } from "@/lib/holidays";
import { calendarUtcDowFromYMD } from "@/lib/dateUtils";

/** 달력에서 공휴일·일요일 강조 색 */
export const CALENDAR_HOLIDAY_COLOR = "#c62828";

/** DB 공휴일 YMD 목록 → 표시용 Set (보강 대체공휴일 포함) */
export function buildHolidayDisplaySet(dbYmds: string[]): Set<string> {
  return mergePublicHolidayYmds(dbYmds);
}

export function isSundayYmd(ymd: string): boolean {
  return calendarUtcDowFromYMD(ymd.slice(0, 10)) === 0;
}

/** 공휴일 또는 일요일이면 달력에서 빨간색 처리 */
export function isRedCalendarDay(ymd: string, holidaySet: Set<string>): boolean {
  return holidaySet.has(ymd) || isSundayYmd(ymd);
}

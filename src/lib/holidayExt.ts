/**
 * 연휴연장휴가(HOLIDAY_EXT) 날짜 판정
 * - 기존: 공휴일/주말이 3일 이상 연속된 구간의 바로 앞/뒤 하루
 * - 추가: 징검다리(앞날·뒷날이 모두 휴무/공휴일이고, 전·후 휴무 구간 합이 3일 이상인 경우)
 */
import { addDaysYMD } from "@/lib/dateUtils";
import { calcWorkingDays } from "@/lib/workdays";

function isWeekendYmd(ymd: string): boolean {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

export function isHolidayOrWeekendYmd(ymd: string, holidaySet: Set<string>): boolean {
  return isWeekendYmd(ymd) || holidaySet.has(ymd);
}

function holidayBlockLengthForward(startYmd: string, isH: (ymd: string) => boolean): number {
  let n = 0;
  let cur = startYmd;
  while (isH(cur)) {
    n += 1;
    cur = addDaysYMD(cur, 1);
  }
  return n;
}

function holidayBlockLengthBackward(endYmd: string, isH: (ymd: string) => boolean): number {
  let n = 0;
  let cur = endYmd;
  while (isH(cur)) {
    n += 1;
    cur = addDaysYMD(cur, -1);
  }
  return n;
}

export function isValidHolidayExtDay(targetYmd: string, holidaySet: Set<string>): boolean {
  const isH = (ymd: string) => isHolidayOrWeekendYmd(ymd, holidaySet);
  const next = addDaysYMD(targetYmd, 1);
  const prev = addDaysYMD(targetYmd, -1);
  const rightBlock = holidayBlockLengthForward(next, isH);
  const leftBlock = holidayBlockLengthBackward(prev, isH);
  const adjacentToLongBlock = rightBlock >= 3 || leftBlock >= 3;
  const sandwichedBridge =
    isH(prev) &&
    isH(next) &&
    holidayBlockLengthBackward(prev, isH) + holidayBlockLengthForward(next, isH) >= 3;
  return adjacentToLongBlock || sandwichedBridge;
}

/** 휴가 신청 화면·API 공통: 연휴연장 종일 일수(징검다리 공휴일 하루 = 1일) */
export function calcHolidayExtFullDays(startStr: string, endStr: string, holidays: string[]): number {
  const holidaySet = new Set(holidays);
  if (!startStr || !endStr) return 0;
  const s = startStr.slice(0, 10);
  const e = endStr.slice(0, 10);
  if (s !== e) return calcWorkingDays(s, e, holidays);
  if (!isValidHolidayExtDay(s, holidaySet)) return 0;
  if (isHolidayOrWeekendYmd(s, holidaySet)) return 1;
  const w = calcWorkingDays(s, e, holidays);
  return w > 0 ? w : 0;
}

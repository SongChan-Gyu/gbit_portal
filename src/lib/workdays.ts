/**
 * 영업일 계산 유틸 (공휴일 배열 포함)
 */

export function calcWorkingDays(
  startStr: string,
  endStr: string,
  holidays: string[] = []   // "YYYY-MM-DD" 배열
): number {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr);
  const end   = new Date(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;

  const holidaySet = new Set(holidays);
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();               // 0=일,6=토
    const ds  = cur.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(ds)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** ISO 날짜 → "YYYY-MM-DD" */
export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 오늘 날짜 문자열 */
export function todayStr(): string {
  return toDateStr(new Date());
}

/** 귀속연도 계산 (5월 기준) */
export function getFiscalYear(date: Date = new Date()): number {
  return date.getMonth() + 1 >= 5 ? date.getFullYear() : date.getFullYear() - 1;
}

/**
 * 영업일 계산 유틸 (공휴일 배열 포함)
 *
 * [타임존 주의]
 * 서버가 UTC 환경(미국 클라우드 등)이면 TZ=Asia/Seoul 환경변수를 설정해야
 * new Date() / getMonth() 등이 KST 기준으로 동작한다.
 * 설정 없이도 날짜 문자열("YYYY-MM-DD") 비교는 KST를 가정한 입력이면 정상이나,
 * todayStr() · getFiscalYear(new Date()) 등 "현재 시각" 기반 함수는 영향받는다.
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

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Date → KST 기준 "YYYY-MM-DD"
 * TZ=Asia/Seoul 환경이면 toLocaleDateString도 동작하지만,
 * UTC 환경에서도 정확하도록 수동 오프셋 보정을 사용한다.
 */
export function toKSTDateStr(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

/** ISO 날짜 → "YYYY-MM-DD" (이미 KST 기준 Date이거나 날짜 전용 사용 시) */
export function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 오늘 날짜 문자열 (KST 기준) */
export function todayStr(): string {
  return toKSTDateStr(new Date());
}

/** 귀속연도 계산 (5월 기준, KST 기준) */
export function getFiscalYear(date: Date = new Date()): number {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.getUTCMonth() + 1 >= 5 ? kst.getUTCFullYear() : kst.getUTCFullYear() - 1;
}

/** "YYYY-MM-DD" 문자열 → 귀속연도 (문자열 자체가 KST 날짜인 경우 바로 사용) */
export function getFiscalYearFromStr(dateStr: string): number {
  const [, mm] = dateStr.split("-").map(Number);
  const yyyy = parseInt(dateStr.slice(0, 4));
  return mm >= 5 ? yyyy : yyyy - 1;
}

/**
 * KST 기준 특정 날짜의 자정(00:00:00) Date 객체 생성.
 * TZ=Asia/Seoul 환경에서 new Date(y, m-1, d)와 동일하나,
 * "YYYY-MM-DD" 문자열 파싱(UTC 자정)과 혼용되는 버그를 방지한다.
 *
 * @param year  연도 (예: 2025)
 * @param month 월 1-indexed (예: 5 = 5월)
 * @param day   일 (예: 1)
 */
export function kstMidnight(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * KST 기준 특정 날짜의 하루 끝(23:59:59.999) Date 객체 생성.
 * validUntil 용도로 사용하면 당일 KST 자정까지 유효하다.
 */
export function kstEndOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

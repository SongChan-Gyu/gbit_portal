/**
 * 영업일 계산 유틸 (공휴일 배열 포함)
 *
 * kstMidnight / kstEndOfDay / fiscalPeriod(leaveCalc)는 +09:00 고정으로 서버 TZ와 무관.
 * getFiscalYear·todayStr 등은 KST 오프셋 보정(UTC 환경에서도 동일 동작).
 */

import { addCalendarYearsToYmd, addDaysYMD, calendarUtcDowFromYMD, kstYmd, todayKstYmd } from "./dateUtils";

export function calcWorkingDays(
  startStr: string,
  endStr: string,
  holidays: string[] = []   // "YYYY-MM-DD" 배열
): number {
  if (!startStr || !endStr) return 0;
  const s = startStr.slice(0, 10);
  const e = endStr.slice(0, 10);
  if (s > e) return 0;

  const holidaySet = new Set(holidays);
  let count = 0;
  let cur = s;
  while (cur <= e) {
    const dow = calendarUtcDowFromYMD(cur);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(cur)) count++;
    cur = addDaysYMD(cur, 1);
  }
  return count;
}

/** 구간 내 영업일 YYYY-MM-DD 목록 (주말·공휴일 제외, 달력 문자열 순회·요일은 calcWorkingDays와 동일) */
export function listWorkingYmds(startStr: string, endStr: string, holidays: string[] = []): string[] {
  if (!startStr || !endStr) return [];
  const s = startStr.slice(0, 10);
  const e = endStr.slice(0, 10);
  if (s > e) return [];
  const holidaySet = new Set(holidays);
  const out: string[] = [];
  let cur = s;
  while (cur <= e) {
    const dow = calendarUtcDowFromYMD(cur);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(cur)) out.push(cur);
    cur = addDaysYMD(cur, 1);
  }
  return out;
}

/**
 * Date → KST 달력 "YYYY-MM-DD" (`dateUtils.kstYmd`와 동일)
 */
export function toKSTDateStr(d: Date = new Date()): string {
  return kstYmd(d);
}

/** DB DateTime 등 → KST 달력 "YYYY-MM-DD" */
export function toDateStr(d: Date): string {
  return kstYmd(d);
}

/** 오늘 날짜 문자열 (한국 달력, Intl Asia/Seoul) */
export function todayStr(): string {
  return todayKstYmd();
}

/** 귀속연도 계산 (5월 기준, KST 달력일) */
export function getFiscalYear(date: Date = new Date()): number {
  return getFiscalYearFromStr(kstYmd(date));
}

/** "YYYY-MM-DD" 문자열 → 귀속연도 (문자열 자체가 KST 날짜인 경우 바로 사용) */
export function getFiscalYearFromStr(dateStr: string): number {
  const [, mm] = dateStr.split("-").map(Number);
  const yyyy = parseInt(dateStr.slice(0, 4));
  return mm >= 5 ? yyyy : yyyy - 1;
}

/**
 * 달력 구간 [startYmd, endYmd]를 귀속연도(5/1~익년 4/30) 경계에서 잘라낸 연속 구간들.
 * 전용 부여 풀·BASE_ANNUAL 등 "한 할당이 구간 전체를 덮어야" 하는 차감을 귀속별로 나눌 때 사용.
 */
export function splitYmdRangeByFiscalYear(startYmd: string, endYmd: string): { startYmd: string; endYmd: string }[] {
  if (!startYmd || !endYmd || startYmd > endYmd) return [];
  const segments: { startYmd: string; endYmd: string }[] = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    const fy = getFiscalYearFromStr(cur);
    const fyEndYmd = `${fy + 1}-04-30`;
    const segEnd = endYmd < fyEndYmd ? endYmd : fyEndYmd;
    segments.push({ startYmd: cur, endYmd: segEnd });
    if (segEnd >= endYmd) break;
    cur = addDaysYMD(segEnd, 1);
  }
  return segments;
}

/**
 * 한국 달력 해당일 00:00 KST (서버 TZ와 무관, 항상 +09:00 오프셋).
 */
export function kstMidnight(year: number, month: number, day: number): Date {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return new Date(`${year}-${mm}-${dd}T00:00:00.000+09:00`);
}

/** 한국 달력 YYYY-MM-DD → 해당일 KST 자정 */
export function kstMidnightFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return kstMidnight(y, m, d);
}

/** 한국 달력 해당일 23:59:59.999 KST */
export function kstEndOfDay(year: number, month: number, day: number): Date {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return new Date(`${year}-${mm}-${dd}T23:59:59.999+09:00`);
}

/**
 * 근속 마일스톤 부여의 validUntil (KST)
 * - 입사 **1주년** 구간(마일스톤 연수 1): 부여일이 속한 귀속연도 말(익년 4/30)까지 — 코드명이 아니라 주년 수로 판별
 * - 그 외 주년: 부여일부터 달력 1년
 */
export function tenureMilestoneValidUntil(grantDate: Date, milestoneYears: number): Date {
  if (milestoneYears === 1) {
    const fiscalYearOfGrant = getFiscalYear(grantDate);
    return new Date(`${fiscalYearOfGrant + 1}-04-30T23:59:59.999+09:00`);
  }
  const untilYmd = addCalendarYearsToYmd(kstYmd(grantDate), 1);
  const [uy, um, ud] = untilYmd.split("-").map(Number);
  return kstEndOfDay(uy, um, ud);
}

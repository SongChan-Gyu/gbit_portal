/**
 * 월별 연차 적립 note 판별 순수 함수 (서버/클라이언트 공용)
 * Prisma를 import하지 않으므로 클라이언트 컴포넌트에서 안전하게 사용 가능.
 */

export const MONTHLY_ACCRUAL_POOL_MARKER = "MONTHLY_ACCRUAL_POOL";
const ACCURED_PREFIX = "ACCURED_MONTHS:";

export function isPoolNote(note: string | null | undefined): boolean {
  return !!(note && note.includes(MONTHLY_ACCRUAL_POOL_MARKER));
}

export function isLegacyMonthlyNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return /MONTHLY_ACCRUAL:\d{4}-\d{2}/.test(note);
}

export function isMonthlyAccrualRowNote(
  note: string | null | undefined,
  sourceCode: string,
): boolean {
  if (sourceCode.startsWith("MONTHLY_ACCRUAL_")) return true;
  if (sourceCode !== "BASE_ANNUAL") return false;
  return isPoolNote(note) || isLegacyMonthlyNote(note);
}

export function parseAccruedMonthsFromNote(note: string | null | undefined): Set<string> {
  const s = note ?? "";
  const m = s.match(new RegExp(`${ACCURED_PREFIX}([^·\\s]+)`));
  if (m?.[1]) return new Set(m[1].split(",").filter(Boolean));
  const months = new Set<string>();
  const re = /MONTHLY_ACCRUAL:(\d{4}-\d{2})/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(s)) !== null) months.add(x[1]!);
  return months;
}

export function buildPoolNote(months: string[]): string {
  const list = [...months].sort().join(",");
  return `${MONTHLY_ACCRUAL_POOL_MARKER} · ${ACCURED_PREFIX}${list} · 월별 연차 누적 (입사 1년 미만)`;
}

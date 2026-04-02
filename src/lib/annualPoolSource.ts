/**
 * 연차 풀(BASE_ANNUAL + TENURE_BONUS + CARRYOVER)을 구성하는 핵심 소스코드.
 * MONTHLY_ACCRUAL_* 은 패턴 기반이므로 DB에서 동적으로 읽을 수 없어 여기에 유지한다.
 * 새 소스코드가 연차 풀에 추가될 때는 이 목록에도 반영해야 한다.
 */
export const ANNUAL_CORE_SOURCE_CODES = ["CARRYOVER", "TENURE_BONUS", "BASE_ANNUAL"] as const;

/**
 * 연차 차감에 포함되는 소스코드 판별.
 * - 핵심 풀: BASE_ANNUAL, TENURE_BONUS, CARRYOVER
 * - 월별 적립: MONTHLY_ACCRUAL_YYYY_MM (동적 패턴)
 * - 레거시 호환: ANNUAL
 */
export function isAnnualPoolSourceCode(sourceCode: string): boolean {
  if (ANNUAL_CORE_SOURCE_CODES.includes(sourceCode as (typeof ANNUAL_CORE_SOURCE_CODES)[number])) return true;
  if (sourceCode.startsWith("MONTHLY_ACCRUAL_")) return true;
  if (sourceCode === "ANNUAL") return true;
  return false;
}

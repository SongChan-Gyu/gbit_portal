export const ANNUAL_CORE_SOURCE_CODES = ["CARRYOVER", "TENURE_BONUS", "BASE_ANNUAL"] as const;

/**
 * 연차 차감에 포함되는 소스코드 판별.
 * - 핵심 풀: BASE_ANNUAL, TENURE_BONUS, CARRYOVER
 * - 월별 적립: MONTHLY_ACCRUAL_YYYY_MM
 * - 레거시 호환: ANNUAL
 */
export function isAnnualPoolSourceCode(sourceCode: string): boolean {
  if (ANNUAL_CORE_SOURCE_CODES.includes(sourceCode as (typeof ANNUAL_CORE_SOURCE_CODES)[number])) return true;
  if (sourceCode.startsWith("MONTHLY_ACCRUAL_")) return true;
  if (sourceCode === "ANNUAL") return true;
  return false;
}

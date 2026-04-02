/**
 * 연차 풀(BASE_ANNUAL + TENURE_BONUS + CARRYOVER)을 구성하는 핵심 sourceCode 목록.
 *
 * [왜 하드코딩인가]
 * isAnnualPoolSourceCode()는 요청 처리 중 동기적으로 여러 번 호출되므로
 * async DB 조회로 전환하면 전 호출 경로를 async로 바꿔야 한다.
 * BASE_ANNUAL / TENURE_BONUS / CARRYOVER는 시스템 설계 상 항상 연차 풀이므로
 * 이 목록은 구조적 상수로 유지한다.
 *
 * [MONTHLY_ACCRUAL_* 패턴]
 * 입사 1년 미만 월별 적립은 신규 시스템에서 sourceCode="BASE_ANNUAL" + note로 구분하지만,
 * 레거시 데이터는 "MONTHLY_ACCRUAL_2024_05" 처럼 월별 고유 sourceCode를 사용했다.
 * 이 패턴 코드들은 AllocationSourceConfig에 없으므로 startsWith() 체크로만 감지한다.
 */
export const ANNUAL_CORE_SOURCE_CODES = ["CARRYOVER", "TENURE_BONUS", "BASE_ANNUAL"] as const;

export function isAnnualPoolSourceCode(sourceCode: string): boolean {
  if (ANNUAL_CORE_SOURCE_CODES.includes(sourceCode as (typeof ANNUAL_CORE_SOURCE_CODES)[number])) return true;
  if (sourceCode.startsWith("MONTHLY_ACCRUAL_")) return true; // 레거시 월별 소스코드 호환
  if (sourceCode === "ANNUAL") return true; // 레거시 단일 소스코드 호환
  return false;
}

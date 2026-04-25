/** 스탬프 힐링과 일반 신청용 하프대체 힐링 구분(메타 컬럼 없이 코드만 사용) */
export const HEALING_DAY_HALF_REPLACE_CODE = "HEALING_DAY_HALF_REPLACE" as const;

export function isHealingHalfReplaceCode(code: string | null | undefined): boolean {
  return (code ?? "").trim() === HEALING_DAY_HALF_REPLACE_CODE;
}

/** 팀 달력 등: 0일 처리 유형 — 오전/오후 대신 휴가명으로 표시 */
export function isZeroDayTeamCalendarCode(code: string | null | undefined): boolean {
  const c = (code ?? "").trim();
  return c === "HEALING_DAY" || c === HEALING_DAY_HALF_REPLACE_CODE;
}

/** 하프데이(PM_HALF_MONTH)와 월 1회 한도를 공유하는 일반 신청 유형 */
export function isHalfdayMonthlySharedPoolCode(code: string | null | undefined): boolean {
  return (code ?? "").trim() === "PM_HALF_MONTH" || isHealingHalfReplaceCode(code);
}

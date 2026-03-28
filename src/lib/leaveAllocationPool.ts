import type { LeaveType } from "@prisma/client";

/** 신청 1행의 차감 일수 (연휴연장은 1일 고정, 반차 0.5) */
export function leaveItemDeductDays(
  it: { days: number },
  lt: Pick<LeaveType, "allocationSourceCode" | "code" | "isHalf" | "daysPerUnit"> | null | undefined,
): number {
  if (!lt) return it.days;
  if (lt.allocationSourceCode === "HOLIDAY_EXT" && !lt.isHalf) return 1;
  if (lt.isHalf) return 0.5;
  return it.days;
}

/** 연차 풀이 아닌 전용 풀 — 만료 시 연차로 대체하면 안 됨 */
export function isDedicatedAllocationSource(sourceCode: string): boolean {
  return !["BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER"].includes(sourceCode);
}

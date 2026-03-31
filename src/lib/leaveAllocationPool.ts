import type { LeaveType } from "@prisma/client";
import { resolveItemTimeSlot } from "@/lib/leaveTimeSlot";
import { leaveTypeWithPolicy } from "@/lib/leaveTypePolicy";
import { isAnnualPoolSourceCode } from "@/lib/annualPoolSource";

/** 클라이언트 LT 등 allows* 가 비어 있을 수 있음 → leaveTypeWithPolicy 로 보완 */
export function leaveItemDeductDays(
  it: { days: number; timeSlot?: string | null },
  lt:
    | (Pick<
        LeaveType,
        "allocationSourceCode" | "code" | "isHalf" | "daysPerUnit" | "isAmOnly" | "isPmOnly"
      > & {
        allowsFullDay?: boolean | null;
        allowsHalfDay?: boolean | null;
        halfDayAmPm?: string | null;
      })
    | null
    | undefined,
): number {
  if (!lt) return it.days;
  const slot = resolveItemTimeSlot(it, leaveTypeWithPolicy(lt));
  if (lt.allocationSourceCode === "HOLIDAY_EXT" && slot === "FULL") return 1;
  if (slot === "AM" || slot === "PM") return 0.5;
  return it.days;
}

/** 연차 풀이 아닌 전용 풀 — 만료 시 연차로 대체하면 안 됨 */
export function isDedicatedAllocationSource(sourceCode: string): boolean {
  return !isAnnualPoolSourceCode(sourceCode);
}

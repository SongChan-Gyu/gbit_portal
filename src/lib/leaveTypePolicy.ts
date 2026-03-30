import type { LeaveTypeSlotPolicy } from "@/lib/leaveTimeSlot";

/** DB에 allows* 미채워진 구 환경 → isHalf 등으로 보완 */
export function leaveTypeWithPolicy(lt: {
  isHalf: boolean;
  isAmOnly: boolean;
  isPmOnly: boolean;
  allowsFullDay?: boolean | null;
  allowsHalfDay?: boolean | null;
  halfDayAmPm?: string | null;
}): LeaveTypeSlotPolicy {
  const allowsFullDay = lt.allowsFullDay ?? !lt.isHalf;
  const allowsHalfDay = lt.allowsHalfDay ?? lt.isHalf;
  const halfDayAmPm =
    lt.halfDayAmPm ??
    (lt.isAmOnly ? "AM_ONLY" : lt.isPmOnly ? "PM_ONLY" : "BOTH");
  return {
    allowsFullDay,
    allowsHalfDay,
    halfDayAmPm,
    isHalf: lt.isHalf,
    isAmOnly: lt.isAmOnly,
    isPmOnly: lt.isPmOnly,
  };
}

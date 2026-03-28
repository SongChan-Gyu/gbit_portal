import type { LeaveType } from "@prisma/client";

export type LeaveTimeSlot = "FULL" | "AM" | "PM";

export type LeaveTypeSlotPolicy = Pick<
  LeaveType,
  "allowsFullDay" | "allowsHalfDay" | "halfDayAmPm" | "isHalf" | "isAmOnly" | "isPmOnly"
>;

/** 항목·유형으로 실제 시간대 (저장된 timeSlot 우선, 없으면 유형 규칙으로 추정) */
export function resolveItemTimeSlot(
  item: { timeSlot?: string | null },
  lt: LeaveTypeSlotPolicy | null | undefined,
): LeaveTimeSlot {
  const raw = item.timeSlot?.trim().toUpperCase();
  if (raw === "FULL" || raw === "AM" || raw === "PM") return raw;

  if (!lt) return "FULL";

  if (lt.allowsHalfDay && !lt.allowsFullDay) {
    if (lt.halfDayAmPm === "AM_ONLY") return "AM";
    if (lt.halfDayAmPm === "PM_ONLY") return "PM";
  }
  if (lt.isHalf && !(lt.allowsFullDay && lt.allowsHalfDay)) {
    if (lt.isAmOnly) return "AM";
    if (lt.isPmOnly) return "PM";
  }
  if (lt.allowsHalfDay && !lt.allowsFullDay && lt.halfDayAmPm === "BOTH") {
    return "PM";
  }
  return "FULL";
}

/** API·클라이언트: 요청 바디 timeSlot 검증 및 확정 */
export function normalizeTimeSlotInput(
  raw: string | undefined | null,
  lt: LeaveTypeSlotPolicy & { name?: string },
): { slot: LeaveTimeSlot | null; error: string | null } {
  const label = lt.name ?? "해당 유형";

  if (lt.allowsFullDay && lt.allowsHalfDay) {
    const r = raw?.trim().toUpperCase();
    if (r === "FULL" || r === "AM" || r === "PM") return { slot: r as LeaveTimeSlot, error: null };
    return { slot: null, error: `${label}: 종일·오전·오후 중 하나를 선택해 주세요.` };
  }

  if (lt.allowsFullDay && !lt.allowsHalfDay) {
    return { slot: "FULL", error: null };
  }

  if (!lt.allowsHalfDay) {
    return { slot: "FULL", error: null };
  }

  if (lt.halfDayAmPm === "AM_ONLY") return { slot: "AM", error: null };
  if (lt.halfDayAmPm === "PM_ONLY") return { slot: "PM", error: null };

  const r = raw?.trim().toUpperCase();
  if (r === "AM" || r === "PM") return { slot: r as LeaveTimeSlot, error: null };
  return { slot: null, error: `${label}: 오전 또는 오후 반차를 선택해 주세요.` };
}

/** 팀 일정 그리드용 */
export function itemSlotForSchedule(
  item: { timeSlot?: string | null },
  lt: LeaveTypeSlotPolicy | null | undefined,
): "AM" | "PM" | "FULL" {
  const s = resolveItemTimeSlot(item, lt);
  if (s === "AM") return "AM";
  if (s === "PM") return "PM";
  return "FULL";
}

/** 대시보드 캘린더 한글 라벨 */
export function itemSlotLabelKo(
  item: { timeSlot?: string | null },
  lt: LeaveTypeSlotPolicy | null | undefined,
): "오전" | "오후" | "휴가" {
  const s = resolveItemTimeSlot(item, lt);
  if (s === "AM") return "오전";
  if (s === "PM") return "오후";
  return "휴가";
}

/** 관리자 저장 시 isHalf / isAmOnly / isPmOnly 와 맞춤 */
export function deriveLegacyHalfFlags(lt: {
  allowsFullDay: boolean;
  allowsHalfDay: boolean;
  halfDayAmPm: string;
}): { isHalf: boolean; isAmOnly: boolean; isPmOnly: boolean } {
  if (lt.allowsFullDay && lt.allowsHalfDay) {
    return { isHalf: false, isAmOnly: false, isPmOnly: false };
  }
  if (lt.allowsHalfDay && !lt.allowsFullDay) {
    return {
      isHalf: true,
      isAmOnly: lt.halfDayAmPm === "AM_ONLY",
      isPmOnly: lt.halfDayAmPm === "PM_ONLY",
    };
  }
  return { isHalf: false, isAmOnly: false, isPmOnly: false };
}

import { resolveItemTimeSlot, type LeaveTimeSlot } from "@/lib/leaveTimeSlot";
import { leaveTypeWithPolicy } from "@/lib/leaveTypePolicy";
import { formatLeaveDayDisplay } from "@/lib/leaveOverviewTable";

export type LeaveTypeLike = {
  code?: string | null;
  name: string;
  color?: string | null;
  applyGroupKey?: string | null;
  allowsFullDay?: boolean | null;
  allowsHalfDay?: boolean | null;
  halfDayAmPm?: string | null;
  isHalf: boolean;
  isAmOnly: boolean;
  isPmOnly: boolean;
};

function slotSuffixKo(slot: LeaveTimeSlot, kind: "half" | "plain") {
  if (slot === "AM") return kind === "half" ? "(오전반차)" : "(오전)";
  if (slot === "PM") return kind === "half" ? "(오후반차)" : "(오후)";
  return "";
}

/** 0.5일·반차 등 — 오전/오후 구분 포함 일수 표기 */
export function formatLeaveItemDaysLabel(
  item: { days: number; timeSlot?: string | null },
  leaveType: LeaveTypeLike,
): string {
  const slot = resolveItemTimeSlot(item, leaveTypeWithPolicy(leaveType));
  const dayPart = `${formatLeaveDayDisplay(Number(item.days))}일`;
  if (slot === "AM") return `오전 ${dayPart}`;
  if (slot === "PM") return `오후 ${dayPart}`;
  return dayPart;
}

/** 신청 1건 요약 일수 (단일 항목이면 반차 구분 포함) */
export function formatLeaveRequestDaysLabel(
  items: Array<{ days: number; timeSlot?: string | null; leaveType: LeaveTypeLike }>,
  totalDays: number,
): string {
  if (items.length === 1) {
    return formatLeaveItemDaysLabel(items[0]!, items[0]!.leaveType);
  }
  return `${formatLeaveDayDisplay(totalDays)}일`;
}

/**
 * 시간-변형(오전/오후/종일) LeaveType을 timeSlot 기준으로 통합 표기.
 * - 기존 DB에 AM/PM 별도 LeaveType이 남아 있어도, 표시만 통합 라벨로 렌더할 때 사용.
 */
export function mergedLeaveTypeLabel(
  leaveType: LeaveTypeLike,
  item: { timeSlot?: string | null },
): { mergedName: string; mergedColor: string | null } {
  const slot = resolveItemTimeSlot(item, leaveTypeWithPolicy(leaveType));
  const group = (leaveType.applyGroupKey ?? "").trim();

  // 그룹 기반 통합 표기
  if (group === "annual") {
    return { mergedName: `연차${slotSuffixKo(slot, "half")}`, mergedColor: leaveType.color ?? null };
  }
  if (group === "public") {
    return { mergedName: `공가${slotSuffixKo(slot, "plain")}`, mergedColor: leaveType.color ?? null };
  }
  if (group === "recognition") {
    return { mergedName: `인정휴가${slotSuffixKo(slot, "plain")}`, mergedColor: leaveType.color ?? null };
  }
  if (group === "care") {
    return { mergedName: `돌봄휴가${slotSuffixKo(slot, "plain")}`, mergedColor: leaveType.color ?? null };
  }
  if (group === "holidayExt") {
    return { mergedName: `연휴연장휴가${slotSuffixKo(slot, "plain")}`, mergedColor: leaveType.color ?? null };
  }
  if (group === "birthday") {
    return { mergedName: `생일반차${slotSuffixKo(slot, "plain")}`, mergedColor: leaveType.color ?? null };
  }

  // fallback: 기존 이름 + 시간대(반차·하프데이 등)
  const suffix = slotSuffixKo(slot, "plain");
  return {
    mergedName: suffix ? `${leaveType.name}${suffix}` : leaveType.name,
    mergedColor: leaveType.color ?? null,
  };
}


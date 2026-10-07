import type { LeaveType } from "@prisma/client";
import { resolveItemTimeSlot } from "@/lib/leaveTimeSlot";
import { leaveTypeWithPolicy } from "@/lib/leaveTypePolicy";
import { isAnnualPoolSourceCode } from "@/lib/annualPoolSource";
import { isHolidayOrWeekendYmd, isValidHolidayExtDay } from "@/lib/holidayExt";
import { isHealingHalfReplaceCode } from "@/lib/healingLeaveCodes";

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
  if (isHealingHalfReplaceCode(lt.code)) return 0;
  const slot = resolveItemTimeSlot(it, leaveTypeWithPolicy(lt));
  if (slot === "AM" || slot === "PM") return 0.5;
  /** FULL: 폼·서버가 계산한 영업일 수(연휴연장은 calcHolidayExtFullDays). 예전처럼 1로 고정하면 주말만 골랐을 때 UI가 틀어짐 */
  return it.days;
}

type LtDeductShape = Parameters<typeof leaveItemDeductDays>[1];

/**
 * 신청 화면 표시·클라이언트 검증용. 반차는 주말·공휴일이면 0일(연휴연장 예외 규칙만 0.5 허용)으로 표시해 API와 맞춤.
 */
export function leaveItemFormDisplayDays(
  it: { days: number; timeSlot?: string | null; startDate: string },
  lt: LtDeductShape,
  holidayYmdSet: Set<string>,
): number {
  if (!lt) return it.days;
  if (isHealingHalfReplaceCode(lt.code)) {
    const s = it.startDate.slice(0, 10);
    if (!s) return 0;
    if (isHolidayOrWeekendYmd(s, holidayYmdSet)) return 0;
    return 0;
  }
  const slot = resolveItemTimeSlot(it, leaveTypeWithPolicy(lt));
  if (slot === "AM" || slot === "PM") {
    const s = it.startDate.slice(0, 10);
    if (isHolidayOrWeekendYmd(s, holidayYmdSet)) {
      if (lt.code === "HOLIDAY_EXT" && isValidHolidayExtDay(s, holidayYmdSet)) return 0.5;
      return 0;
    }
    return 0.5;
  }
  return leaveItemDeductDays(it, lt);
}

/** 연차 풀이 아닌 전용 풀 — 만료 시 연차로 대체하면 안 됨 */
export function isDedicatedAllocationSource(sourceCode: string): boolean {
  return !isAnnualPoolSourceCode(sourceCode);
}

export type RemainingPeriodAlloc = {
  id: string;
  validUntil: Date | string;
  validFrom?: Date | string;
};

function toTime(v: Date | string): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

function remainingOf(remainingById: Map<string, number> | Record<string, number>, id: string): number {
  if (remainingById instanceof Map) return remainingById.get(id) ?? 0;
  return remainingById[id] ?? 0;
}

/** 잔여 유효기간이 짧은(만료가 가까운) 할당이 앞. 동일 만료면 부여일이 빠른 쪽. */
export function compareAllocationsByRemainingPeriod(
  a: RemainingPeriodAlloc,
  b: RemainingPeriodAlloc,
): number {
  const untilDiff = toTime(a.validUntil) - toTime(b.validUntil);
  if (untilDiff !== 0) return untilDiff;
  if (a.validFrom != null && b.validFrom != null) {
    const fromDiff = toTime(a.validFrom) - toTime(b.validFrom);
    if (fromDiff !== 0) return fromDiff;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortAllocationsByRemainingPeriod<T extends RemainingPeriodAlloc>(allocs: T[]): T[] {
  return [...allocs].sort(compareAllocationsByRemainingPeriod);
}

/** 신청 구간을 덮고 잔여가 충분한 할당 중, 잔여 기간이 가장 짧은 건. */
export function pickAllocationByRemainingPeriod<T extends RemainingPeriodAlloc>(
  list: T[],
  remainingById: Map<string, number> | Record<string, number>,
  days: number,
  covers: (a: T) => boolean,
): T | null {
  for (const a of sortAllocationsByRemainingPeriod(list)) {
    if (!covers(a)) continue;
    if (remainingOf(remainingById, a.id) >= days) return a;
  }
  return null;
}

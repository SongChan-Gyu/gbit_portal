"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import DatePickerButton from "@/components/ui/DatePickerButton";
import { useRouter } from "next/navigation";
import { calcWorkingDays, todayStr } from "@/lib/workdays";
import { calcHolidayExtFullDays, isHolidayOrWeekendYmd } from "@/lib/holidayExt";
import { calendarUtcDowFromYMD, eachYmdInInclusiveRange, formatYMD, isWednesdayYMD } from "@/lib/dateUtils";
import { leaveItemDeductDays, leaveItemFormDisplayDays } from "@/lib/leaveAllocationPool";
import { resolveItemTimeSlot } from "@/lib/leaveTimeSlot";
import { leaveTypeWithPolicy } from "@/lib/leaveTypePolicy";
import { isAnnualPoolSourceCode } from "@/lib/annualPoolSource";
import { buildHolidayDisplaySet, isRedCalendarDay, CALENDAR_HOLIDAY_COLOR } from "@/lib/calendarHolidayDisplay";
import { ChevronRight, Info, AlertCircle, CheckCircle2, ExternalLink, Calendar } from "lucide-react";
import { isHealingHalfReplaceCode, isHalfdayMonthlySharedPoolCode } from "@/lib/healingLeaveCodes";

// ── 타입 ──────────────────────────────────────────────────────
interface LT {
  id: string; code: string; name: string; daysPerUnit: number;
  deductFromBalance: boolean; approvalSteps: number;
  maxPerMonth: number | null; requiresStamp: boolean; stampCount: number | null;
  isHalf: boolean; isAmOnly: boolean; isPmOnly: boolean;
  sortOrder?: number | null;
  applyGroupKey?: string | null;
  allowsFullDay?: boolean | null;
  allowsHalfDay?: boolean | null;
  halfDayAmPm?: string | null;
  color: string;
  allocationSourceCode: string | null;
  usageCategory?: string | null;
  displayHint?: string | null;
}
/** 신청 구간 [minYmd,maxYmd]와 할당 validFrom~validUntil(날짜 문자열 앞 10자)이 겹치면 true */
function allocationOverlapsApplicationYmd(
  a: { validFrom: string; validUntil: string },
  minYmd: string,
  maxYmd: string,
): boolean {
  const from = a.validFrom.slice(0, 10);
  const until = a.validUntil.slice(0, 10);
  return from <= maxYmd && until >= minYmd;
}

interface Alloc {
  id: string; sourceCode: string; label: string; totalDays: number; usedDays: number;
  validFrom: string; validUntil: string;
}
interface LeaveItem {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  _groupKey: string;
  _healingSelected?: boolean;
  /** FULL | AM | PM — 종일+반차 겸용 유형에서 필수 */
  timeSlot?: string;
}

function initItem(startDate = todayStr()): LeaveItem {
  return { leaveTypeId: "", startDate, endDate: startDate, days: 0, reason: "", _groupKey: "", _healingSelected: false, timeSlot: "" };
}

function rowUsesSingleDayOnly(it: LeaveItem, lt: LT | undefined): boolean {
  if (!lt) return false;
  const pol = leaveTypeWithPolicy(lt);
  if (pol.allowsFullDay && pol.allowsHalfDay) {
    return it.timeSlot === "AM" || it.timeSlot === "PM";
  }
  return pol.allowsHalfDay && !pol.allowsFullDay;
}

const PM_HALF_MONTH_CODE = "PM_HALF_MONTH";
const HIDDEN_LT_CODES = new Set(["DEPT_BONUS", "POOL_TENURE_BONUS"]);

// ── 휴가 그룹 정의 ────────────────────────────────────────────
type SubDef = { label: string; code: string; desc?: string };
type GroupDef = {
  key: string; label: string; meta: string; color: string;
  borderClass: string; subs: SubDef[];
};

const LEAVE_GROUPS_BASE: GroupDef[] = [
  {
    key: "annual", label: "연차", meta: "",
    color: "#2563eb", borderClass: "border-blue-500",
    subs: [
      { label: "선택", code: "ANNUAL" },
    ],
  },
  {
    key: "condolence",
    label: "경조휴가",
    meta: "",
    color: "#f59e0b",
    borderClass: "border-amber-500",
    subs: [{ label: "신청", code: "CONDOLENCE" }],
  },
  {
    key: "public",
    label: "공가",
    meta: "",
    color: "#64748b",
    borderClass: "border-slate-600",
    subs: [
      { label: "선택", code: "PUBLIC" },
    ],
  },
  {
    key: "recognition",
    label: "인정휴가",
    meta: "",
    color: "#475569",
    borderClass: "border-slate-500",
    subs: [
      { label: "선택", code: "RECOGNITION" },
    ],
  },
  {
    key: "care", label: "돌봄휴가", meta: "",
    color: "#059669", borderClass: "border-emerald-500",
    subs: [
      { label: "선택", code: "CARE" },
    ],
  },
  {
    key: "holidayExt",
    label: "연휴연장",
    meta: "휴무 3일+ 연속 시 앞·뒤·징검다리 영업일(귀속 1일)",
    color: "#0ea5e9",
    borderClass: "border-sky-500",
    subs: [
      { label: "선택", code: "HOLIDAY_EXT" },
    ],
  },
  {
    key: "stamp",
    label: "스탬프",
    meta: "오후인정·힐링데이(스탬프)",
    color: "#d97706",
    borderClass: "border-amber-500",
    subs: [
      { label: "힐링데이(스탬프)", code: "HEALING_DAY" },
      { label: "오후 인정", code: "PM_RECOG_STAMP" },
    ],
  },
  {
    key: "halfday", label: "하프데이", meta: "",
    color: "#0284c7", borderClass: "border-sky-500",
    subs: [
      { label: "하프데이", code: "PM_HALF_MONTH", desc: "수요일 오후" },
      { label: "힐링데이(하프대체)", code: "HEALING_DAY_HALF_REPLACE", desc: "0일 · 영업일 요일 무관" },
    ],
  },
  {
    key: "sick",
    label: "병가",
    meta: "입원·통원 등",
    color: "#dc2626",
    borderClass: "border-red-500",
    subs: [{ label: "신청", code: "SICK" }],
  },
  {
    key: "award", label: "포상휴가", meta: "",
    color: "#7c3aed", borderClass: "border-violet-500",
    subs: [{ label: "신청", code: "AWARD" }],
  },
  {
    key: "tenure",
    label: "근속휴가",
    meta: "입사 N주년 부여",
    color: "#10b981",
    borderClass: "border-emerald-600",
    /** 하위 항목은 `dynamicLeaveGroups`에서 DB(`applyGroupKey === tenure`)로 채움 */
    subs: [],
  },
  {
    key: "birthday",
    label: "생일반차",
    meta: "생일에 자동 부여 0.5일",
    color: "#ec4899",
    borderClass: "border-pink-500",
    subs: [
      { label: "선택", code: "BIRTHDAY_HALF" },
    ],
  },
];

const CODE_TO_GROUP_BASE: Record<string, string> = {};
LEAVE_GROUPS_BASE.forEach((g) => g.subs.forEach((s) => { CODE_TO_GROUP_BASE[s.code] = g.key; }));

/** UI: 자산형(소모 가능 부여) vs 사유형 — 섹션 분리 */
const BASE_ASSET_GROUP_KEYS = new Set([
  "annual", "care", "holidayExt", "stamp", "halfday", "award", "birthday", "tenure",
]);
const BASE_REASON_GROUP_KEYS = new Set(["condolence", "public", "recognition", "sick"]);

function leaveTypeMetaText(lt: LT): string {
  return lt.displayHint?.trim() ?? "";
}

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
function ymdWithDay(ymd: string): string {
  const idx = calendarUtcDowFromYMD(ymd);
  const w = Number.isFinite(idx) ? (DOW_KO[idx] ?? "") : "";
  return `${ymd}(${w})`;
}

/**
 * 휴가 신청(/api/leave/request) 페이로드·합계·검증에 넣을 행인지.
 * - 힐링데이만 예외: 스탬프 메뉴에서 `/api/leave/healing-day`로만 신청. UI에서는 `HEALING` 선택 시
 *   `_healingSelected` + `leaveTypeId` 비움.
 * - 오후인정(스탬프) `PM_RECOG_STAMP` 등 나머지는 전부 일반 `leaveTypeId`로 이 API 사용.
 */
function includeInLeaveRequestPayload(it: LeaveItem): boolean {
  if (it._healingSelected) return false;
  return Boolean(it.leaveTypeId?.trim());
}
function includeHealingPayload(it: LeaveItem): boolean {
  return !!it._healingSelected;
}

/** 항목 추가만 하고 아무 것도 고르지 않은 행 */
function isBlankLeaveRow(it: LeaveItem): boolean {
  if (it._healingSelected) return false;
  if (it.leaveTypeId?.trim()) return false;
  if (it._groupKey) return false;
  if ((it.days || 0) > 0) return false;
  return true;
}

function needsLeaveRowValidation(it: LeaveItem): boolean {
  if (isBlankLeaveRow(it)) return false;
  if (it._healingSelected) return false;
  return true;
}

// ── 중복 체크 ─────────────────────────────────────────────────
function detectOverlap(items: LeaveItem[], leaveTypes: LT[]): string | null {
  const byDate: Record<string, { am: boolean; pm: boolean; full: boolean }> = {};
  for (const item of items) {
    if (!item.leaveTypeId || !item.startDate) continue;
    const lt = leaveTypes.find((t) => t.id === item.leaveTypeId);
    if (!lt) continue;
    if (isHealingHalfReplaceCode(lt.code)) continue;
    const slot = resolveItemTimeSlot(item, leaveTypeWithPolicy(lt));
    const s = item.startDate.slice(0, 10);
    const e = (item.endDate || item.startDate).slice(0, 10);
    for (const key of eachYmdInInclusiveRange(s, e)) {
      if (!byDate[key]) byDate[key] = { am: false, pm: false, full: false };
      const d = byDate[key];
      if (slot === "FULL") {
        if (d.full || d.am || d.pm) return `${key}: 날짜 중복 신청입니다.`;
        d.full = true;
      } else if (slot === "AM") {
        if (d.full || d.am) return `${key}: 오전 시간대 중복입니다.`;
        d.am = true;
      } else {
        if (d.full || d.pm) return `${key}: 오후 시간대 중복입니다.`;
        d.pm = true;
      }
    }
  }
  return null;
}

// ── 컴포넌트 ──────────────────────────────────────────────────
export default function LeaveApplyForm({
  leaveTypes,
  allocations,
  totalStamps,
  afternoonStampSlots,
  healingStampSlots,
  halfDayUsed,
  holidays,
}: {
  leaveTypes: LT[];
  allocations: Alloc[];
  totalStamps: number;
  afternoonStampSlots: number;
  healingStampSlots: number;
  halfDayUsed: number;
  holidays: string[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<LeaveItem[]>([initItem()]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const todayYmd = todayStr();
  /** 폼에 적힌 날짜들의 최소~최대 — 없으면 오늘(초기 안내용). 귀속연도가 아니라 이 구간과 유효기간 겹침만 본다 */
  const applicationYmdRange = useMemo(() => {
    const ys: string[] = [];
    for (const it of items) {
      if (!it.startDate?.trim()) continue;
      ys.push(it.startDate.slice(0, 10));
      ys.push((it.endDate || it.startDate).slice(0, 10));
    }
    if (ys.length === 0) return { min: todayYmd, max: todayYmd };
    let min = ys[0]!;
    let max = ys[0]!;
    for (const y of ys) {
      if (y < min) min = y;
      if (y > max) max = y;
    }
    return { min, max };
  }, [items, todayYmd]);

  const isAllocationRelevantForApplication = (a: Alloc) =>
    allocationOverlapsApplicationYmd(a, applicationYmdRange.min, applicationYmdRange.max);

  const ltByCode = useMemo(
    () => Object.fromEntries(leaveTypes.filter(t => !HIDDEN_LT_CODES.has(t.code)).map((t) => [t.code, t])),
    [leaveTypes]
  );

  const holidaySet = useMemo(() => buildHolidayDisplaySet(holidays), [holidays]);

  const canSubmitZeroHalfReplace = useMemo(() => {
    return items.some((it) => {
      if (!needsLeaveRowValidation(it)) return false;
      if (!it.leaveTypeId?.trim()) return false;
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      if (!lt || !isHealingHalfReplaceCode(lt.code)) return false;
      const y = it.startDate?.slice(0, 10);
      if (!y) return false;
      return !isHolidayOrWeekendYmd(y, holidaySet);
    });
  }, [items, leaveTypes, holidaySet]);

  /** 연휴연장: 영업일만 일수에 포함 (API·calcHolidayExtFullDays와 동일) */
  function fullDaysForLeaveType(lt: LT | undefined, start: string, end: string) {
    if (lt?.code === "HOLIDAY_EXT") return calcHolidayExtFullDays(start, end, holidays);
    return calcWorkingDays(start, end, holidays);
  }

  const annualPoolAllocs = useMemo(
    () =>
      allocations
        .filter((a) => isAnnualPoolSourceCode(a.sourceCode) && isAllocationRelevantForApplication(a))
        .sort((x, y) => (x.validUntil < y.validUntil ? -1 : 1)),
    [allocations, applicationYmdRange.min, applicationYmdRange.max],
  );
  const baseAnnualDisplayTotal = useMemo(
    () => annualPoolAllocs
      .filter((a) => a.sourceCode === "BASE_ANNUAL" || a.sourceCode.startsWith("MONTHLY_ACCRUAL_") || a.sourceCode === "ANNUAL")
      .reduce((s, a) => s + a.totalDays, 0),
    [annualPoolAllocs],
  );
  const annualPoolRemaining = useMemo(
    () => annualPoolAllocs.reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0),
    [annualPoolAllocs]
  );
  /** 관리자 부여 풀별 잔여 (LeaveAllocation.sourceCode 합산, 유효 기간 내) */
  const poolRemainingBySource = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of allocations) {
      if (!isAllocationRelevantForApplication(a)) continue;
      m[a.sourceCode] = (m[a.sourceCode] ?? 0) + Math.max(0, a.totalDays - a.usedDays);
    }
    return m;
  }, [allocations, applicationYmdRange.min, applicationYmdRange.max]);

  const isSelectableCode = (code: string) => {
    const lt = ltByCode[code];
    if (!lt) return false;
    // 근속 마일스톤: 해당 휴가코드 풀 잔여가 있을 때만 선택지 노출
    if ((lt.applyGroupKey ?? "").trim().toLowerCase() === "tenure") {
      return (poolRemainingBySource[code] ?? 0) > 0;
    }
    return true;
  };

  const dynamicLeaveGroups = useMemo<GroupDef[]>(() => {
    const base = LEAVE_GROUPS_BASE.map((g) => {
      if (g.key !== "tenure") return { ...g, subs: [...g.subs] };
      const tenureSubs = leaveTypes
        .filter((t) => !HIDDEN_LT_CODES.has(t.code))
        .filter((t) => (t.applyGroupKey ?? "").trim().toLowerCase() === "tenure")
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((t) => ({ label: t.name, code: t.code, desc: leaveTypeMetaText(t) }));
      return {
        ...g,
        subs:
          tenureSubs.length > 0
            ? tenureSubs
            : [
                { label: "1년근속휴가", code: "TENURE_1Y" },
                { label: "5년근속휴가", code: "TENURE_5Y" },
                { label: "10년근속휴가", code: "TENURE_10Y" },
              ],
      };
    });
    const knownCodes = new Set(base.flatMap((g) => g.subs.map((s) => s.code)));
    const extras = leaveTypes
      .filter((t) => !HIDDEN_LT_CODES.has(t.code))
      .filter((t) => !knownCodes.has(t.code))
      .map((t) => t);
    const customByKey = new Map<string, GroupDef>();
    for (const t of extras) {
      const rawKey = (t.applyGroupKey ?? "").trim().toLowerCase();
      const keyPart = rawKey || t.code.toLowerCase();
      const isReason =
        t.usageCategory === "REASON" ||
        (!t.deductFromBalance && !t.allocationSourceCode &&
        (rawKey.includes("reason") || rawKey.includes("public") || rawKey.includes("recognition") || rawKey.includes("sick")));
      const groupKey = `${isReason ? "custom-reason:" : "custom-asset:"}${keyPart}`;
      const current = customByKey.get(groupKey);
      const sub = { label: t.name, code: t.code, desc: leaveTypeMetaText(t) };
      if (!current) {
        customByKey.set(groupKey, {
          key: groupKey,
          label: t.name,
          meta: leaveTypeMetaText(t),
          color: t.color || (isReason ? "#64748b" : "#2563eb"),
          borderClass: isReason ? "border-slate-500" : "border-blue-500",
          subs: [sub],
        });
      } else {
        current.subs.push(sub);
      }
    }
    base.push(...Array.from(customByKey.values()));
    return base;
  }, [leaveTypes]);
  const codeToGroup = useMemo(() => {
    const m: Record<string, string> = { ...CODE_TO_GROUP_BASE };
    dynamicLeaveGroups.forEach((g) => g.subs.forEach((s) => { m[s.code] = g.key; }));
    return m;
  }, [dynamicLeaveGroups]);

  const visibleLeaveGroups = useMemo(() => {
    return dynamicLeaveGroups
      .map((g) => {
        const mappedSubs = g.subs.map((s) => {
          const t = ltByCode[s.code];
          const hint = t?.displayHint?.trim();
          return { ...s, desc: hint || s.desc };
        });
        const groupMeta =
          g.meta ||
          mappedSubs.find((s) => Boolean(s.desc))?.desc ||
          "";
        if (g.key === "stamp") return { ...g, meta: groupMeta, subs: mappedSubs }; // 힐링/스탬프는 코드 유무와 무관하게 안내/선택 유지
        const subs = mappedSubs.filter((s) => isSelectableCode(s.code));
        return { ...g, meta: groupMeta, subs };
      })
      .filter((g) => g.subs.length > 0);
  }, [dynamicLeaveGroups, ltByCode, poolRemainingBySource, applicationYmdRange.min, applicationYmdRange.max]);
  const leaveGroupsAsset = useMemo(
    () => visibleLeaveGroups.filter((g) => BASE_ASSET_GROUP_KEYS.has(g.key) || g.key.startsWith("custom-asset:")),
    [visibleLeaveGroups],
  );
  const leaveGroupsReason = useMemo(
    () => visibleLeaveGroups.filter((g) => BASE_REASON_GROUP_KEYS.has(g.key) || g.key.startsWith("custom-reason:")),
    [visibleLeaveGroups],
  );

  // ── 아이템 조작 ───────────────────────────────────────────
  function selectGroup(idx: number, groupKey: string) {
    const grp = visibleLeaveGroups.find((g) => g.key === groupKey);
    if (!grp) return;
    if (grp.key === "stamp") {
      setItems((prev) => prev.map((it, i) =>
        i === idx ? { ...it, leaveTypeId: "", _groupKey: groupKey, days: 0, _healingSelected: false } : it
      ));
      return;
    }
    setItems((prev) => prev.map((it, i) =>
      i === idx ? { ...it, leaveTypeId: "", _groupKey: groupKey, days: 0, _healingSelected: false } : it
    ));
    if (grp.subs.length === 1) {
      selectLeaveType(idx, grp.subs[0].code, groupKey);
    }
  }

  function selectLeaveType(idx: number, code: string, groupKey?: string) {
    if (code === "HEALING" || code === "HEALING_DAY") {
      setItems((prev) => prev.map((it, i) =>
        i === idx ? { ...it, leaveTypeId: "", _groupKey: groupKey ?? "stamp", _healingSelected: true, days: 0 } : it
      ));
      return;
    }
    const lt = ltByCode[code];
    if (!lt) return;
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const pol = leaveTypeWithPolicy(lt);
      let timeSlot = "";
      /** 종일 가능 유형: 기본 종일(종일+반차 겸용 시에도 미선택으로 일수 0 방지) */
      if (pol.allowsFullDay) timeSlot = "FULL";
      else if (pol.halfDayAmPm === "AM_ONLY") timeSlot = "AM";
      else if (pol.halfDayAmPm === "PM_ONLY") timeSlot = "PM";
      else timeSlot = "";
      const single = pol.allowsHalfDay && !pol.allowsFullDay;
      const isHalfDay = timeSlot === "AM" || timeSlot === "PM";
      let days = single || isHalfDay
        ? (timeSlot ? 0.5 : 0)
        : timeSlot === "FULL" || (pol.allowsFullDay && !pol.allowsHalfDay)
          ? fullDaysForLeaveType(lt, it.startDate, it.endDate)
          : 0;
      if (isHealingHalfReplaceCode(lt.code)) days = 0;
      return {
        ...it, leaveTypeId: lt.id,
        _groupKey: groupKey ?? codeToGroup[code] ?? it._groupKey,
        timeSlot,
        days,
        endDate: single || isHalfDay ? it.startDate : it.endDate,
        _healingSelected: false,
      };
    }));
  }

  function setTimeSlotForItem(idx: number, slot: "FULL" | "AM" | "PM") {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      if (!lt) return it;
      let days = slot === "FULL"
        ? fullDaysForLeaveType(lt, it.startDate, it.endDate)
        : 0.5;
      if (isHealingHalfReplaceCode(lt.code)) days = 0;
      const endDate = slot === "FULL" ? it.endDate : it.startDate;
      return { ...it, timeSlot: slot, days, endDate };
    }));
  }

  function changeDate(idx: number, field: "startDate" | "endDate", value: string) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      const newStart = field === "startDate" ? value : it.startDate;
      const single = rowUsesSingleDayOnly(it, lt);
      const newEnd = field === "endDate" ? value : (single ? newStart : it.endDate);
      const pol = lt ? leaveTypeWithPolicy(lt) : null;
      const ts = it.timeSlot;
      let days = 0;
      if (ts === "AM" || ts === "PM" || (pol && pol.allowsHalfDay && !pol.allowsFullDay && (pol.halfDayAmPm === "AM_ONLY" || pol.halfDayAmPm === "PM_ONLY"))) {
        days = 0.5;
      } else if (ts === "FULL" || (pol && pol.allowsFullDay && !pol.allowsHalfDay)) {
        days = fullDaysForLeaveType(lt ?? undefined, newStart, newEnd);
      } else if (pol && pol.allowsHalfDay && !pol.allowsFullDay && pol.halfDayAmPm === "BOTH") {
        days = ts === "AM" || ts === "PM" ? 0.5 : 0;
      } else if (pol && pol.allowsFullDay && pol.allowsHalfDay) {
        days = ts === "FULL" ? fullDaysForLeaveType(lt ?? undefined, newStart, newEnd) : (ts === "AM" || ts === "PM" ? 0.5 : 0);
      }
      if (lt && isHealingHalfReplaceCode(lt.code)) days = 0;
      return { ...it, startDate: newStart, endDate: newEnd, days };
    }));
  }

  function addItem() {
    const last = items[items.length - 1];
    setItems((prev) => [...prev, initItem(last?.startDate ?? todayStr())]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── 달력 팝오버 (input 클릭 → 바로 드롭다운) ──
  const [calendarItemIdx, setCalendarItemIdx] = useState<number | null>(null);
  const [calendarStep, setCalendarStep] = useState<"start" | "end">("start");
  const [calendarPickedStart, setCalendarPickedStart] = useState<string | null>(null);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth() + 1);
  const calendarRef = useRef<HTMLDivElement>(null);
  /** 달력 팝업: DB만으로 부족할 수 있어 연도별 Nager+보강을 API로 합침 */
  const [calendarDisplayYmds, setCalendarDisplayYmds] = useState<string[]>([]);
  const holidaySetForCalendar = useMemo(() => {
    const s = new Set(holidaySet);
    for (const d of calendarDisplayYmds) s.add(d);
    return s;
  }, [holidaySet, calendarDisplayYmds]);

  useEffect(() => {
    if (calendarItemIdx == null) return;
    let cancelled = false;
    setCalendarDisplayYmds([]);
    (async () => {
      try {
        const res = await fetch(`/api/public/holidays-kr?year=${calendarYear}`);
        const j = await res.json();
        const dates = Array.isArray(j.dates) ? (j.dates as string[]) : [];
        if (!cancelled) setCalendarDisplayYmds(dates);
      } catch {
        if (!cancelled) setCalendarDisplayYmds([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [calendarItemIdx, calendarYear]);

  function openCalendar(idx: number, step: "start" | "end" = "start") {
    const it = items[idx];
    if (!it) return;
    setCalendarItemIdx(idx);
    setCalendarStep(step);
    setCalendarPickedStart(step === "end" ? it.startDate : null);
    const dateStr = step === "end" ? (it.endDate || it.startDate) : it.startDate;
    const [y, m] = dateStr ? dateStr.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1];
    setCalendarYear(y || new Date().getFullYear());
    setCalendarMonth(m || new Date().getMonth() + 1);
  }
  function closeCalendar() {
    setCalendarItemIdx(null);
    setCalendarStep("start");
    setCalendarPickedStart(null);
  }
  function onCalendarDateClick(dateStr: string) {
    if (calendarItemIdx == null) return;
    const it = items[calendarItemIdx];
    const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
    const isHalf = lt ? rowUsesSingleDayOnly(it, lt) || (leaveTypeWithPolicy(lt).allowsHalfDay && !leaveTypeWithPolicy(lt).allowsFullDay) : false;

    if (calendarStep === "start") {
      setCalendarPickedStart(dateStr);
      if (isHalf) {
        if (lt?.code === PM_HALF_MONTH_CODE && !isWednesdayYMD(dateStr)) {
          setError("하프데이는 수요일을 선택해 주세요.");
          return;
        }
        if (isHealingHalfReplaceCode(lt?.code) && isHolidayOrWeekendYmd(dateStr, holidaySetForCalendar)) {
          setError("힐링데이(하프대체)는 영업일만 선택할 수 있습니다.");
          return;
        }
        changeDate(calendarItemIdx, "startDate", dateStr);
        closeCalendar();
        return;
      }
      setCalendarStep("end");
      return;
    }

    // step === "end"
    const start = calendarPickedStart ?? it.startDate;
    let startFinal = start;
    let endFinal = dateStr;
    if (dateStr < start) {
      startFinal = dateStr;
      endFinal = start;
    }
    changeDate(calendarItemIdx, "startDate", startFinal);
    changeDate(calendarItemIdx, "endDate", endFinal);
    closeCalendar();
  }

  /** 일수·결재 요약·API payload — includeInLeaveRequestPayload 와 동일 기준 */
  const effectiveSubmitItems = items.filter(includeInLeaveRequestPayload);
  const healingSubmitItems = items.filter(includeHealingPayload);
  const totalDays = effectiveSubmitItems.reduce((s, it) => {
    const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
    if (!lt) return s;
    return s + leaveItemFormDisplayDays({ days: it.days, timeSlot: it.timeSlot, startDate: it.startDate }, lt, holidaySet);
  }, 0);
  const approvalStepVals = effectiveSubmitItems.map((it) => {
    const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
    return lt?.approvalSteps ?? 1;
  });
  const maxSteps = approvalStepVals.length ? Math.max(...approvalStepVals) : 1;
  const minSteps = approvalStepVals.length ? Math.min(...approvalStepVals) : 1;

  // ── 제출 ──────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    for (const it of items) {
      if (!needsLeaveRowValidation(it)) continue;
      if (!it.leaveTypeId?.trim()) { setError("작성 중인 항목에 휴가 유형을 선택해 주세요."); return; }
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      const actualDays = lt
        ? leaveItemFormDisplayDays({ days: it.days, timeSlot: it.timeSlot, startDate: it.startDate }, lt, holidaySet)
        : 0;
      if (actualDays <= 0) {
        if (isHealingHalfReplaceCode(lt?.code)) {
          const y = it.startDate.slice(0, 10);
          if (!y || isHolidayOrWeekendYmd(y, holidaySet)) {
            setError("힐링데이(하프대체)는 영업일만 선택할 수 있습니다.");
            return;
          }
        } else {
          setError(
            lt?.code === "HOLIDAY_EXT"
              ? "연휴연장은 주말·공휴일만 고르면 영업일 0일입니다. 앞·뒤·징검다리 영업일을 골랐는지, 휴무 3일 이상 연속 조건에 맞는지 확인하세요. 공휴일 DB는 npm run db:seed:base 등으로 반영하세요."
              : "휴가 일수를 확인해 주세요.",
          );
          return;
        }
      }
      if (lt?.code === "PM_RECOG_STAMP" && afternoonStampSlots < 1) {
        setError(`${lt.name}: 8칸 완성·오후 미사용인 스탬프 장이 없습니다.`);
        return;
      }
      if (lt?.requiresStamp && lt.stampCount && lt.code !== "PM_RECOG_STAMP") {
        if (totalStamps < (lt.stampCount ?? 0)) {
          setError(`${lt.name}: 스탬프 ${lt.stampCount}개 필요 (현재 ${totalStamps}개)`);
          return;
        }
      }
      if (lt && isHalfdayMonthlySharedPoolCode(lt.code) && halfDayUsed >= 1) {
        setError("하프데이·힐링데이(하프대체)는 같은 달에 합쳐서 1회만 사용할 수 있습니다.");
        return;
      }
    }
    let annualNeed = 0;
    for (const it of items) {
      if (!needsLeaveRowValidation(it)) continue;
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      if (!lt?.deductFromBalance || lt.allocationSourceCode) continue;
      annualNeed += leaveItemFormDisplayDays({ days: it.days, timeSlot: it.timeSlot, startDate: it.startDate }, lt, holidaySet);
    }
    if (annualNeed > annualPoolRemaining + 1e-6) {
      setError(
        `잔여 연차 부족 — 연차·반차 등 ${annualNeed.toFixed(1)}일 필요, 신청 일정과 겹치는 연차 풀 잔여 ${annualPoolRemaining.toFixed(1)}일`,
      );
      return;
    }
    const dedicatedTotals: Record<string, number> = {};
    for (const it of items) {
      if (!needsLeaveRowValidation(it)) continue;
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      const src = lt?.allocationSourceCode?.trim();
      if (!lt || !src) continue;
      const d = leaveItemFormDisplayDays({ days: it.days, timeSlot: it.timeSlot, startDate: it.startDate }, lt, holidaySet);
      dedicatedTotals[src] = (dedicatedTotals[src] ?? 0) + d;
    }
    for (const [src, need] of Object.entries(dedicatedTotals)) {
      const rem = poolRemainingBySource[src] ?? 0;
      if (need > rem) {
        const srcName =
          leaveTypes.find((t) => t.allocationSourceCode === src)?.name
          || allocations.find((a) => a.sourceCode === src)?.label
          || src;
        setError(`「${srcName}」부여 잔여 부족 — 신청 ${need.toFixed(1)}일, 잔여 ${rem.toFixed(1)}일`); return;
      }
    }
    const overlap = detectOverlap(items, leaveTypes);
    if (overlap) { setError(overlap); return; }

    setLoading(true);
    for (const it of healingSubmitItems) {
      if (!it.startDate) {
        setLoading(false);
        setError("힐링데이 신청 날짜를 선택해 주세요.");
        return;
      }
      const hres = await fetch("/api/leave/healing-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: it.startDate }),
      });
      const hdata = await hres.json().catch(() => ({}));
      if (!hres.ok) {
        setLoading(false);
        setError(hdata.error ?? "힐링데이 신청 중 오류가 발생했습니다.");
        return;
      }
    }

    const payload = effectiveSubmitItems.map((it) => {
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId)!;
      const days = leaveItemDeductDays({ days: it.days, timeSlot: it.timeSlot }, lt);
      const timeSlot = resolveItemTimeSlot({ timeSlot: it.timeSlot }, leaveTypeWithPolicy(lt));
      return { ...it, allocationId: "", days, timeSlot };
    });
    if (payload.length > 0) {
      const res  = await fetch("/api/leave/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) { setError(data.error ?? "신청 중 오류 발생"); return; }
    } else {
      setLoading(false);
    }
    router.push("/leave/my?applied=1");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {items.map((item, idx) => {
        const lt        = leaveTypes.find((t) => t.id === item.leaveTypeId);
        const grp       = dynamicLeaveGroups.find((g) => g.key === item._groupKey);
        const actualDays = lt
          ? leaveItemFormDisplayDays(
              { days: item.days, timeSlot: item.timeSlot, startDate: item.startDate },
              lt,
              holidaySet,
            )
          : 0;
        const polUi     = lt ? leaveTypeWithPolicy(lt) : null;
        const isAnnualDeduct = lt?.deductFromBalance ?? false;

        return (
          <div key={idx} className="panel overflow-visible">
            {/* 항목 헤더 */}
            <div className={`border-l-4 ${grp ? grp.borderClass : "border-gray-200"}`}>
              <div className="panel-header bg-gray-50/80 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    항목 {idx + 1}
                  </span>
                  {lt && grp && (
                    <>
                      <ChevronRight size={12} className="text-gray-300" />
                      <span className="text-xs font-semibold" style={{ color: grp.color }}>
                        {grp.label}
                      </span>
                      <ChevronRight size={12} className="text-gray-300" />
                      <span className="text-xs text-gray-600">{lt.name}</span>
                      <span className="ml-2 text-xs font-bold text-gray-800">
                        {isHealingHalfReplaceCode(lt.code) ? "0일(출퇴근 조정)" : `${actualDays}일`}
                      </span>
                    </>
                  )}
                </div>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(idx)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1">
                    삭제
                  </button>
                )}
              </div>

              <div className="panel-body space-y-5">
                {/* STEP 1: 휴가 종류 */}
                <section className="space-y-4">
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    01. 휴가 종류
                  </p>
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" aria-hidden />
                      자산형 (연차·돌봄·이벤트 등 부여 일수)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                      {leaveGroupsAsset.map((g) => {
                        const isSelected = item._groupKey === g.key;
                        return (
                          <button key={g.key} type="button"
                            onClick={() => selectGroup(idx, g.key)}
                            className={`flex flex-col items-center justify-center p-3.5 rounded-lg border text-center transition-all ${
                              isSelected
                                ? "border-2 bg-white shadow-sm"
                                : "border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50"
                            }`}
                            style={isSelected ? { borderColor: g.color } : {}}>
                            <span className={`text-sm font-semibold leading-tight ${
                              isSelected ? "" : "text-gray-600"
                            }`} style={isSelected ? { color: g.color } : {}}>
                              {g.label}
                            </span>
                            {g.meta ? <span className="text-xs text-gray-500 mt-1 leading-tight">{g.meta}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-400" aria-hidden />
                      사유형 (공가·병가·인정 등)
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {leaveGroupsReason.map((g) => {
                        const isSelected = item._groupKey === g.key;
                        return (
                          <button key={g.key} type="button"
                            onClick={() => selectGroup(idx, g.key)}
                            className={`flex flex-col items-center justify-center p-3.5 rounded-lg border text-center transition-all ${
                              isSelected
                                ? "border-2 bg-white shadow-sm"
                                : "border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50"
                            }`}
                            style={isSelected ? { borderColor: g.color } : {}}>
                            <span className={`text-sm font-semibold leading-tight ${
                              isSelected ? "" : "text-gray-600"
                            }`} style={isSelected ? { color: g.color } : {}}>
                              {g.label}
                            </span>
                            {g.meta ? <span className="text-xs text-gray-500 mt-1 leading-tight">{g.meta}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* 그룹은 선택됐지만 휴가 유형 미등록 시 (연휴연장/생일반차 등) */}
                {item._groupKey && grp && grp.subs.length === 1 && !item.leaveTypeId && !(item._groupKey === "stamp" && item._healingSelected) && (
                  <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">
                      <strong>{grp.label}</strong> 휴가 유형이 시스템에 등록되지 않았습니다.
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      관리자 &gt; 휴가 유형 설정에서 해당 유형을 추가하거나, DB 시드를 실행해 주세요.
                    </p>
                  </section>
                )}

                {/* STEP 2: 시간대 (서브 옵션이 여러 개인 경우) */}
                {/* 종일+반차 겸용 유형(코드 하나): 신청 시 택일 */}
                {item.leaveTypeId && lt && polUi?.allowsFullDay && polUi?.allowsHalfDay && (
                  <section>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      02. 신청 단위
                    </p>
                    <div className="flex gap-2">
                      {([
                        { k: "FULL" as const, label: "종일(기간)" },
                        { k: "AM" as const, label: "오전 반차" },
                        { k: "PM" as const, label: "오후 반차" },
                      ]).map(({ k, label }) => (
                        <button key={k} type="button"
                          onClick={() => setTimeSlotForItem(idx, k)}
                          className={`flex-1 flex flex-col items-center py-2.5 rounded-lg border transition-all ${
                            item.timeSlot === k
                              ? "border-2 bg-white shadow-sm"
                              : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                          }`}
                          style={item.timeSlot === k ? { borderColor: grp?.color ?? "#3b82f6" } : {}}>
                          <span className={`text-[15px] font-semibold ${item.timeSlot === k ? "" : "text-gray-700"}`}
                            style={item.timeSlot === k ? { color: grp?.color ?? "#3b82f6" } : {}}>
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* half-only + AM/PM 선택 (예: 생일반차 통합 타입) */}
                {item.leaveTypeId && lt && polUi?.allowsHalfDay && !polUi?.allowsFullDay && polUi?.halfDayAmPm === "BOTH" && (
                  <section>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      02. 시간대
                    </p>
                    <div className="flex gap-2">
                      {([
                        { k: "AM" as const, label: "오전 반차" },
                        { k: "PM" as const, label: "오후 반차" },
                      ]).map(({ k, label }) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setTimeSlotForItem(idx, k)}
                          className={`flex-1 flex flex-col items-center py-2.5 rounded-lg border transition-all ${
                            item.timeSlot === k
                              ? "border-2 bg-white shadow-sm"
                              : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                          }`}
                          style={item.timeSlot === k ? { borderColor: grp?.color ?? "#ec4899" } : {}}
                        >
                          <span
                            className={`text-[15px] font-semibold ${item.timeSlot === k ? "" : "text-gray-700"}`}
                            style={item.timeSlot === k ? { color: grp?.color ?? "#ec4899" } : {}}
                          >
                            {label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {item._groupKey && grp && grp.subs.length > 1 && !(item.leaveTypeId && lt && polUi?.allowsFullDay && polUi?.allowsHalfDay) && (
                  <section>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      02. 시간대
                    </p>
                    <div className="flex gap-2">
                      {grp.subs.map((sub) => {
                        const subLt = ltByCode[sub.code];
                        const isHealing = sub.code === "HEALING" || sub.code === "HEALING_DAY";
                        const isSelected = isHealing ? item._healingSelected : lt?.code === sub.code;
                        return (
                          <button key={sub.code} type="button"
                            onClick={() => selectLeaveType(idx, sub.code, grp.key)}
                            disabled={!isHealing && !subLt}
                            className={`flex-1 flex flex-col items-center py-2.5 rounded-lg border transition-all ${
                              isSelected
                                ? "border-2 bg-white shadow-sm"
                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                            style={isSelected ? { borderColor: grp.color } : {}}>
                            <span className={`text-[15px] font-semibold ${isSelected ? "" : "text-gray-700"}`}
                              style={isSelected ? { color: grp.color } : {}}>
                              {sub.label}
                            </span>
                            {sub.desc && (
                              <span className="text-xs text-gray-400 mt-0.5">{sub.desc}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* 스탬프 > 힐링데이: 02에서 힐링 선택 후에만 안내·날짜 (그룹만 고른 상태에서는 숨김) */}
                {item._groupKey === "stamp" && item._healingSelected && (
                  <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-800 mb-1">힐링데이 — 스탬프 쿠폰 메뉴에서 신청</p>
                    <p className="text-xs text-amber-700 mb-3 leading-relaxed">
                      스탬프 4개 소진 시 10:20 출근 또는 16:00 퇴근(1시간 40분 단축)으로 처리됩니다.
                      결재 없이 자동 등록되며, 연차 일수에 포함되지 않습니다.
                    </p>
                    <a href="/stamp" target="_blank"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 underline hover:text-amber-900">
                      <ExternalLink size={12} />
                      스탬프 쿠폰 페이지로 이동
                    </a>
                    <div className="mt-3">
                      <label className="block text-sm text-amber-900 mb-1">힐링데이 신청 날짜</label>
                      <DatePickerButton
                        value={item.startDate}
                        onChange={(d) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, startDate: d, endDate: d } : it))}
                        holidaySet={holidaySetForCalendar}
                        className="bg-white"
                      />
                      <p className="text-xs text-amber-700 mt-1">중복 날짜/이미 신청된 날짜는 제출 시 자동 검증됩니다.</p>
                    </div>
                  </section>
                )}

                {/* STEP 3: 신청 기간 */}
                {item.leaveTypeId && (!polUi?.allowsFullDay || !polUi?.allowsHalfDay || ["FULL", "AM", "PM"].includes(item.timeSlot ?? "")) && (() => {
                  const dual = !!(polUi?.allowsFullDay && polUi?.allowsHalfDay);
                  const pol = lt ? leaveTypeWithPolicy(lt) : null;
                  const hasTimeStep =
                    (item.leaveTypeId && lt && polUi?.allowsFullDay && polUi?.allowsHalfDay) ||
                    (item.leaveTypeId && lt && polUi?.allowsHalfDay && !polUi?.allowsFullDay && polUi?.halfDayAmPm === "BOTH") ||
                    (item._groupKey && grp && grp.subs.length > 1);
                  const singleDayField = lt
                    ? rowUsesSingleDayOnly(item, lt)
                    || !!(pol?.allowsHalfDay && !pol.allowsFullDay)
                    || (dual && item.timeSlot !== "FULL" && (item.timeSlot === "AM" || item.timeSlot === "PM"))
                    : false;
                  return (
                  <section>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {hasTimeStep ? "03." : "02."} 신청 기간
                    </p>
                    <div className={`grid gap-3 ${singleDayField ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
                      <div>
                        <label className="block text-sm text-gray-500 mb-1">
                          {singleDayField ? "날짜" : "시작일"}
                        </label>
                        <button type="button"
                          onClick={() => openCalendar(idx, "start")}
                          className="input w-full text-left flex items-center justify-between gap-2 cursor-pointer">
                          <span className={item.startDate ? "text-gray-800" : "text-gray-400"}>
                            {item.startDate || "날짜 선택"}
                          </span>
                          <Calendar size={15} className="text-gray-400 shrink-0" />
                        </button>
                      </div>
                      {!singleDayField && (
                        <div>
                          <label className="block text-sm text-gray-500 mb-1">종료일</label>
                          <button type="button"
                            onClick={() => openCalendar(idx, "end")}
                            className="input w-full text-left flex items-center justify-between gap-2 cursor-pointer">
                            <span className={item.endDate ? "text-gray-800" : "text-gray-400"}>
                              {item.endDate || "날짜 선택"}
                            </span>
                            <Calendar size={15} className="text-gray-400 shrink-0" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 일수 카운터 (힐링데이는 스탬프 페이지에서만 사용, 여기서는 연차/반차/하프데이 등) */}
                    {lt?.code === "PM_HALF_MONTH" && (
                      <p className="mt-2 text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                        하프데이는 <strong>수요일 오후</strong>에만 사용 가능합니다.
                      </p>
                    )}
                    {lt && isHealingHalfReplaceCode(lt.code) && (
                      <p className="mt-2 text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                        힐링데이(하프대체)는 <strong>영업일이면 요일과 관계없이</strong> 신청할 수 있습니다. 휴가일수는{" "}
                        <strong>0일(출퇴근 조정)</strong>이며, 하프데이와 같은 달 사용 횟수(1회)를 공유합니다.
                      </p>
                    )}
                    <div className={`mt-2 px-3 py-2 rounded-lg flex items-center gap-2 text-sm ${
                      actualDays > 0
                        ? "bg-blue-50 border border-blue-100 text-blue-700"
                        : "bg-gray-50 border border-gray-200 text-gray-400"
                    }`}>
                      {lt && isHealingHalfReplaceCode(lt.code) ? (
                        item.startDate?.trim() &&
                        isHolidayOrWeekendYmd(item.startDate.slice(0, 10), holidaySet) ? (
                          <span>
                            힐링데이(하프대체)는 <strong>영업일</strong>에만 신청할 수 있습니다. 주말·공휴일은 선택할 수 없습니다.
                          </span>
                        ) : (
                          <span>
                            휴가일수 <strong>0일(출퇴근 조정)</strong>
                          </span>
                        )
                      ) : lt && (resolveItemTimeSlot({ timeSlot: item.timeSlot }, leaveTypeWithPolicy(lt)) === "AM" || resolveItemTimeSlot({ timeSlot: item.timeSlot }, leaveTypeWithPolicy(lt)) === "PM") ? (
                        actualDays <= 0 ? (
                          <span>
                            선택한 날은 <strong>영업일이 아닙니다</strong>. 반차는 영업일에만 신청할 수 있습니다.
                            <span className="ml-2 text-xs opacity-80">(연휴연장은 규정된 징검다리·전후일만 가능)</span>
                          </span>
                        ) : (
                        <span>
                          {resolveItemTimeSlot({ timeSlot: item.timeSlot }, leaveTypeWithPolicy(lt)) === "AM" ? "오전" : "오후"}{" "}
                          <strong>0.5일</strong>
                          <span className="ml-2 text-xs opacity-70">(반일 근무)</span>
                        </span>
                        )
                      ) : item.startDate?.trim() && (item.endDate || item.startDate)?.trim() ? (
                        <span>
                          영업일 기준 <strong>{actualDays}일</strong>
                          <span className="ml-2 text-xs opacity-70">주말·공휴일 자동 제외</span>
                        </span>
                      ) : (
                        <span>날짜를 선택하면 영업일이 자동 계산됩니다</span>
                      )}
                    </div>
                  </section>
                  );
                })()}

                {/* 연차 가용 현황 */}
                {isAnnualDeduct && item.leaveTypeId && (
                  <section className="rounded-lg border border-orange-100 bg-orange-50/60 p-3">
                    <p className="text-[10px] text-orange-700/90 mb-1.5 leading-snug">
                      위 신청 날짜 구간과 <strong>유효기간이 겹치는</strong> 연차만 반영합니다.
                    </p>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-orange-800">연차 가용 현황</span>
                      <span className={`text-sm font-bold ${
                        annualPoolRemaining < actualDays && actualDays > 0
                          ? "text-red-600" : "text-orange-700"
                      }`}>
                        잔여 {annualPoolRemaining.toFixed(1)}일
                      </span>
                    </div>
                    <div className="space-y-1">
                      {annualPoolAllocs.length > 0 && (
                        <div className="flex items-center justify-between text-xs text-orange-700">
                          <span className="truncate mr-3">
                            연차 (기본 {baseAnnualDisplayTotal} · 근속 {annualPoolAllocs.find(a => a.sourceCode === "TENURE_BONUS")?.totalDays ?? 0} · 이월 {annualPoolAllocs.find(a => a.sourceCode === "CARRYOVER")?.totalDays ?? 0})
                          </span>
                          <span className="shrink-0 tabular-nums">
                            잔여 {annualPoolRemaining.toFixed(1)}일
                          </span>
                        </div>
                      )}
                    </div>
                    {annualPoolRemaining < actualDays && actualDays > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600 font-medium">
                        <AlertCircle size={12} />
                        잔여 연차가 부족합니다
                      </div>
                    )}
                  </section>
                )}

                {/* 스탬프: 오후인정(스탬프) */}
                {lt?.code === "PM_RECOG_STAMP" && item.leaveTypeId && (
                  <section className="rounded-lg border border-purple-100 bg-purple-50/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-purple-800">오후 인정(스탬프)</span>
                      <span
                        className={`text-xs font-semibold ${
                          afternoonStampSlots >= 1 ? "text-emerald-600" : "text-purple-600"
                        }`}
                      >
                        사용 가능 {afternoonStampSlots}회
                        {afternoonStampSlots >= 1 ? (
                          <span className="ml-1">✓</span>
                        ) : (
                          <span className="ml-1">(8칸 완성 장 필요)</span>
                        )}
                      </span>
                    </div>
                    <p className="text-[11px] text-purple-900/80">
                      누적 스탬프 {totalStamps}칸 · 힐링 사용 가능 장 {healingStampSlots}개(참고) · 오후인정은
                      완성된 장마다 1회입니다.
                    </p>
                  </section>
                )}

                {/* STEP: 사유 */}
                {item.leaveTypeId && (
                  <section>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      사유
                      {!isAnnualDeduct && (
                        <span className="ml-1 text-xs normal-case font-normal text-gray-400">(선택)</span>
                      )}
                    </p>
                    <input className="input" type="text"
                      placeholder="예: 개인 사유, 가족 행사, 병원 방문 등"
                      value={item.reason}
                      onChange={(e) => setItems(prev => prev.map((it, i) =>
                        i === idx ? { ...it, reason: e.target.value } : it
                      ))}
                      required={isAnnualDeduct} />
                  </section>
                )}

                {/* 결재 단계 안내 */}
                {lt && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Info size={11} className="text-gray-400" />
                    {lt.approvalSteps === 0
                      ? "결재 없이 즉시 처리"
                      : "1단계 결재 (팀원→팀장, 팀장→PM · PM·관리자 본인은 자동)"}
                    {isAnnualDeduct && (
                      <span className="ml-2 text-orange-500">· 연차 {actualDays}일 차감</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* 항목 추가 버튼 */}
      <button type="button" onClick={addItem}
        className="w-full py-2.5 border border-dashed border-gray-300 rounded-lg text-xs text-gray-400
                   hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/30 transition-all">
        + 항목 추가 &nbsp;<span className="text-gray-300">예: 오전반차 + 오후인정 복수 신청</span>
      </button>

      {/* 오류 */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── 신청 요약 + 제출 ─────────────────────────────────── */}
      {(totalDays > 0 || healingSubmitItems.length > 0 || canSubmitZeroHalfReplace) && (
        <div className="panel bg-slate-50 border-slate-200">
          <div className="panel-header border-b border-slate-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span className="text-sm font-semibold text-gray-800">신청 요약</span>
            </div>
            <span className="text-xs text-gray-500">
              {maxSteps === 0
                ? "즉시 처리"
                : minSteps === maxSteps
                  ? (maxSteps === 1 ? "팀장 1단계" : "팀장 → PM 2단계")
                  : `결재 단계가 항목마다 다름 (최대 ${maxSteps}단) · 한 번에 제출해도 단계별로 신청이 나뉨`}
            </span>
          </div>
          <div className="divide-y divide-slate-200">
            {items.map((it, i) => {
              if (it._healingSelected) {
                return (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-amber-500" />
                      <div>
                        <span className="text-[13px] font-medium text-gray-800">스탬프 · 힐링데이</span>
                        <span className="text-xs text-gray-400 ml-2">{ymdWithDay(it.startDate)}</span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-700">0일(출퇴근 조정)</span>
                  </div>
                );
              }
              const t = leaveTypes.find((t) => t.id === it.leaveTypeId);
              if (!t) return null;
              const g = dynamicLeaveGroups.find((g) => g.key === it._groupKey);
              const slot = resolveItemTimeSlot({ timeSlot: it.timeSlot }, leaveTypeWithPolicy(t));
              const slotLabel = slot === "FULL" ? "종일" : slot === "AM" ? "오전" : "오후";
              const d = leaveItemFormDisplayDays({ days: it.days, timeSlot: it.timeSlot, startDate: it.startDate }, t, holidaySet);
              const summaryLeft = isHealingHalfReplaceCode(t.code)
                ? `${g?.label ?? ""} · ${t.name}`
                : `${g?.label} · ${slotLabel}`;
              const summaryRight = isHealingHalfReplaceCode(t.code) ? "0일(출퇴근 조정)" : `${d}일`;
              return (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: g?.color ?? "#94a3b8" }} />
                    <div>
                      <span className="text-[13px] font-medium text-gray-800">
                        {summaryLeft}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {it.startDate === it.endDate
                          ? ymdWithDay(it.startDate)
                          : `${ymdWithDay(it.startDate)} ~ ${ymdWithDay(it.endDate)}`}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{summaryRight}</span>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-slate-200 bg-white">
            <div className="shrink-0">
              <span className="text-xs text-gray-500">합계</span>
              <span className="ml-1.5 text-lg font-black text-blue-700">
                {totalDays.toFixed(1)}<span className="text-sm font-normal ml-0.5">일</span>
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={() => router.back()}
                className="btn-secondary btn-sm px-3 whitespace-nowrap">취소</button>
              <button type="submit" disabled={loading || (totalDays <= 0 && healingSubmitItems.length === 0 && !canSubmitZeroHalfReplace)}
                className="btn-primary btn-sm px-4 whitespace-nowrap">
                {loading ? (
                  <><span className="spinner" /><span>신청 중…</span></>
                ) : (
                  totalDays > 0 ? `${totalDays.toFixed(1)}일 신청하기` : "신청하기"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 신청 요약 없을 때 하단 버튼 */}
      {totalDays <= 0 && healingSubmitItems.length === 0 && !canSubmitZeroHalfReplace && (
        <div className="flex gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary flex-1">취소</button>
          <button type="submit" disabled className="btn-primary flex-1 opacity-40 cursor-not-allowed">
            휴가 유형과 기간을 선택하세요
          </button>
        </div>
      )}

      {/* 달력 팝오버: input 클릭 → 드롭다운 */}
      {calendarItemIdx != null && (() => {
        const it = items[calendarItemIdx];
        const lt = leaveTypes.find((t) => t.id === it?.leaveTypeId);
        const isHalf = it && lt
          ? rowUsesSingleDayOnly(it, lt) || (leaveTypeWithPolicy(lt).allowsHalfDay && !leaveTypeWithPolicy(lt).allowsFullDay)
          : false;
        const start = calendarPickedStart ?? it?.startDate ?? null;
        const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
        const lastDay = new Date(calendarYear, calendarMonth, 0);
        const startPad = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const weekDays = ["일", "월", "화", "수", "목", "금", "토"];
        const cells: (string | null)[] = [];
        for (let i = 0; i < startPad; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) {
          const y = calendarYear;
          const m = String(calendarMonth).padStart(2, "0");
          const day = String(d).padStart(2, "0");
          cells.push(`${y}-${m}-${day}`);
        }
        const prevMonth = () => {
          if (calendarMonth === 1) { setCalendarMonth(12); setCalendarYear((y) => y - 1); }
          else setCalendarMonth((m) => m - 1);
        };
        const nextMonth = () => {
          if (calendarMonth === 12) { setCalendarMonth(1); setCalendarYear((y) => y + 1); }
          else setCalendarMonth((m) => m + 1);
        };
        return (
          <>
            {/* 오버레이: 달력 바깥 클릭 시 닫힘 */}
            <div className="fixed inset-0 z-40" onClick={closeCalendar} />
            {/* 팝오버 패널 */}
            <div
              ref={calendarRef}
              className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 w-[min(340px,95vw)]"
              style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">
                  {calendarStep === "start" ? (isHalf ? "날짜 선택" : "시작일") : "종료일"} 선택
                </span>
                <button type="button" onClick={closeCalendar}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">✕</button>
              </div>
              {/* 선택된 날짜 표시 */}
              {it && (it.startDate || it.endDate) && (
                <div className="flex gap-2 mb-3">
                  <div className={`flex-1 text-center py-1.5 rounded-lg text-sm font-medium border ${
                    calendarStep === "start" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 bg-gray-50"
                  }`}>
                    <p className="text-[10px] opacity-60 mb-0.5">{isHalf ? "날짜" : "시작일"}</p>
                    <p>{(calendarStep === "end" ? (calendarPickedStart || it.startDate) : it.startDate) || "—"}</p>
                  </div>
                  {!isHalf && (
                    <div className={`flex-1 text-center py-1.5 rounded-lg text-sm font-medium border ${
                      calendarStep === "end" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500 bg-gray-50"
                    }`}>
                      <p className="text-[10px] opacity-60 mb-0.5">종료일</p>
                      <p>{it.endDate || "—"}</p>
                    </div>
                  )}
                </div>
              )}
              {/* 월 네비게이션 */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <button type="button" onClick={prevMonth}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 font-bold">‹</button>
                <span className="text-sm font-semibold tabular-nums">
                  {calendarYear}년 {calendarMonth}월
                </span>
                <button type="button" onClick={nextMonth}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 font-bold">›</button>
              </div>
              {/* 달력 그리드 */}
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {weekDays.map((w, wi) => (
                  <div key={w}
                    className={`text-[10px] font-semibold py-1 ${wi === 0 || wi === 6 ? "text-red-400" : "text-gray-400"}`}>
                    {w}
                  </div>
                ))}
                {cells.map((dateStr, i) => {
                  if (!dateStr) return <div key={`e-${i}`} />;
                  const isStart = dateStr === start;
                  const isEnd = calendarStep === "end" && dateStr === it?.endDate;
                  const isInRange = calendarStep === "end" && start && dateStr > start && it?.endDate && dateStr < it.endDate;
                  const isRedDay = isRedCalendarDay(dateStr, holidaySetForCalendar);
                  const isSat = new Date(calendarYear, calendarMonth - 1, parseInt(dateStr.slice(8))).getDay() === 6;
                  const spanStyle: React.CSSProperties = (isStart || isEnd)
                    ? { color: "#fff", fontWeight: 700 }
                    : isRedDay
                      ? { color: CALENDAR_HOLIDAY_COLOR, fontWeight: 600 }
                      : isSat
                        ? { color: "#3b82f6" }
                        : isInRange
                          ? { color: "#1e40af" }
                          : { color: "#111827" };
                  return (
                    <button key={dateStr} type="button"
                      onClick={() => onCalendarDateClick(dateStr)}
                      className={`aspect-square rounded-lg text-sm transition-colors ${
                        isStart || isEnd
                          ? "bg-blue-600 hover:bg-blue-700"
                          : isInRange
                            ? "bg-blue-100"
                            : isRedDay
                              ? "hover:bg-red-50"
                              : "hover:bg-gray-100"
                      }`}>
                      <span style={spanStyle}>{dateStr.slice(8, 10).replace(/^0/, "")}</span>
                    </button>
                  );
                })}
              </div>
              {calendarStep === "end" && !isHalf && (
                <p className="mt-3 text-xs text-gray-400 text-center">종료일을 선택하세요 (같은 날 = 1일)</p>
              )}
            </div>
          </>
        );
      })()}
    </form>
  );
}

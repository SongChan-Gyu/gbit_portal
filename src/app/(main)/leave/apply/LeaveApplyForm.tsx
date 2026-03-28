"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { calcWorkingDays, todayStr } from "@/lib/workdays";
import { formatYMD, isWednesdayYMD } from "@/lib/dateUtils";
import { leaveItemDeductDays } from "@/lib/leaveAllocationPool";
import { resolveItemTimeSlot } from "@/lib/leaveTimeSlot";
import { leaveTypeWithPolicy } from "@/lib/leaveTypePolicy";
import { ChevronRight, Info, AlertCircle, CheckCircle2, ExternalLink, Calendar } from "lucide-react";

// ── 타입 ──────────────────────────────────────────────────────
interface LT {
  id: string; code: string; name: string; daysPerUnit: number;
  deductFromBalance: boolean; approvalSteps: number;
  maxPerMonth: number | null; requiresStamp: boolean; stampCount: number | null;
  isHalf: boolean; isAmOnly: boolean; isPmOnly: boolean;
  allowsFullDay?: boolean | null;
  allowsHalfDay?: boolean | null;
  halfDayAmPm?: string | null;
  color: string;
  allocationSourceCode: string | null;
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

// ── 연차 = 기본연차 + 근속가산 + 이월연차만 (특별휴가·부서추가 제외) ──
const ANNUAL_ONLY_SOURCES = new Set([
  "BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER",
]);
const PM_HALF_MONTH_CODE = "PM_HALF_MONTH";
const HIDDEN_LT_CODES = new Set(["TENURE_1Y", "TENURE_5Y", "TENURE_10Y", "DEPT_BONUS"]);

// ── 휴가 그룹 정의 ────────────────────────────────────────────
type SubDef = { label: string; code: string; desc?: string };
type GroupDef = {
  key: string; label: string; meta: string; color: string;
  borderClass: string; subs: SubDef[];
};

const LEAVE_GROUPS: GroupDef[] = [
  {
    key: "annual", label: "연차", meta: "연차 차감",
    color: "#2563eb", borderClass: "border-blue-500",
    subs: [
      { label: "종일",    code: "ANNUAL" },
      { label: "오전반차", code: "AM_HALF",  desc: "" },
      { label: "오후반차", code: "PM_HALF",  desc: "" },
    ],
  },
  {
    key: "public", label: "공가", meta: "연차 미차감",
    color: "#64748b", borderClass: "border-slate-600",
    subs: [
      { label: "종일", code: "PUBLIC" },
      { label: "오전", code: "PUBLIC_AM" },
      { label: "오후", code: "PUBLIC_PM" },
    ],
  },
  {
    key: "recognition", label: "인정휴가", meta: "연차 미차감",
    color: "#475569", borderClass: "border-slate-500",
    subs: [
      { label: "종일",    code: "RECOGNITION" },
      { label: "오전",    code: "RECOGNITION_AM" },
      { label: "오후",    code: "RECOGNITION_PM" },
    ],
  },
  {
    key: "care", label: "돌봄휴가", meta: "연 2일 한도",
    color: "#059669", borderClass: "border-emerald-500",
    subs: [
      { label: "종일",    code: "CARE" },
      { label: "오전",    code: "CARE_AM" },
      { label: "오후",    code: "CARE_PM" },
    ],
  },
  {
    key: "holidayExt", label: "연휴연장휴가", meta: "귀속연도 1일 (오전·오후·종일)",
    color: "#0ea5e9", borderClass: "border-sky-500",
    subs: [
      { label: "종일", code: "HOLIDAY_EXT", desc: "연휴 3일 이상 시 앞뒤 연속일 사용 가능" },
      { label: "오전", code: "HOLIDAY_EXT_AM" },
      { label: "오후", code: "HOLIDAY_EXT_PM" },
    ],
  },
  {
    key: "stamp", label: "스탬프", meta: "힐링데이·오후인정",
    color: "#d97706", borderClass: "border-amber-500",
    subs: [
      { label: "힐링데이",   code: "HEALING", desc: "스탬프 메뉴에서 신청 (장당 1회)" },
      { label: "오후 인정", code: "PM_RECOG_STAMP", desc: "10칸 완성 장당 1회" },
    ],
  },
  {
    key: "halfday", label: "하프데이", meta: "수요일 오후",
    color: "#0284c7", borderClass: "border-sky-500",
    subs: [{ label: "하프데이", code: "PM_HALF_MONTH", desc: "월 1회" }],
  },
  {
    key: "sick", label: "병가", meta: "미차감 (급여만 감액)",
    color: "#dc2626", borderClass: "border-red-500",
    subs: [{ label: "신청", code: "SICK" }],
  },
  {
    key: "award", label: "포상휴가", meta: "별도 부여",
    color: "#7c3aed", borderClass: "border-violet-500",
    subs: [{ label: "신청", code: "AWARD" }],
  },
  {
    key: "birthday", label: "생일반차", meta: "생일 해당 월 자동 부여 0.5일",
    color: "#ec4899", borderClass: "border-pink-500",
    subs: [
      { label: "오전 반차", code: "BIRTHDAY_HALF_AM", desc: "0.5일" },
      { label: "오후 반차", code: "BIRTHDAY_HALF", desc: "0.5일" },
    ],
  },
];

const CODE_TO_GROUP: Record<string, string> = {};
LEAVE_GROUPS.forEach((g) => g.subs.forEach((s) => { CODE_TO_GROUP[s.code] = g.key; }));

/** UI: 자산형(소모 가능 부여) vs 사유형 — 섹션 분리 */
const ASSET_GROUP_KEYS = new Set([
  "annual", "care", "holidayExt", "stamp", "halfday", "award", "birthday",
]);
const REASON_GROUP_KEYS = new Set(["public", "recognition", "sick"]);
const LEAVE_GROUPS_ASSET = LEAVE_GROUPS.filter((g) => ASSET_GROUP_KEYS.has(g.key));
const LEAVE_GROUPS_REASON = LEAVE_GROUPS.filter((g) => REASON_GROUP_KEYS.has(g.key));

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
function ymdWithDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  const w = DOW_KO[dt.getDay()] ?? "";
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
    const slot = resolveItemTimeSlot(item, leaveTypeWithPolicy(lt));
    const cur = new Date(item.startDate);
    const end = new Date(item.endDate);
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10);
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
      cur.setDate(cur.getDate() + 1);
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

  const now = new Date().toISOString();

  const ltByCode = useMemo(
    () => Object.fromEntries(leaveTypes.filter(t => !HIDDEN_LT_CODES.has(t.code)).map((t) => [t.code, t])),
    [leaveTypes]
  );

  const annualPoolAllocs = useMemo(
    () => allocations
      .filter((a) => ANNUAL_ONLY_SOURCES.has(a.sourceCode) && a.validUntil >= now)
      .sort((x, y) => x.validUntil < y.validUntil ? -1 : 1),
    [allocations, now]
  );
  const annualPoolRemaining = useMemo(
    () => annualPoolAllocs.reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0),
    [annualPoolAllocs]
  );
  /** 관리자 부여 풀별 잔여 (LeaveAllocation.sourceCode 합산, 유효 기간 내) */
  const poolRemainingBySource = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of allocations) {
      if (a.validUntil < now) continue;
      m[a.sourceCode] = (m[a.sourceCode] ?? 0) + Math.max(0, a.totalDays - a.usedDays);
    }
    return m;
  }, [allocations, now]);

  // ── 아이템 조작 ───────────────────────────────────────────
  function selectGroup(idx: number, groupKey: string) {
    const grp = LEAVE_GROUPS.find((g) => g.key === groupKey);
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
    if (code === "HEALING") {
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
      if (pol.allowsFullDay && pol.allowsHalfDay) timeSlot = "";
      else if (pol.allowsFullDay && !pol.allowsHalfDay) timeSlot = "FULL";
      else if (pol.halfDayAmPm === "AM_ONLY") timeSlot = "AM";
      else if (pol.halfDayAmPm === "PM_ONLY") timeSlot = "PM";
      else timeSlot = "";
      const single = pol.allowsHalfDay && !pol.allowsFullDay;
      const isHalfDay = timeSlot === "AM" || timeSlot === "PM";
      const days = single || isHalfDay
        ? (timeSlot ? 0.5 : 0)
        : timeSlot === "FULL" || (pol.allowsFullDay && !pol.allowsHalfDay)
          ? calcWorkingDays(it.startDate, it.endDate, holidays)
          : 0;
      return {
        ...it, leaveTypeId: lt.id,
        _groupKey: groupKey ?? CODE_TO_GROUP[code] ?? it._groupKey,
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
      const days = slot === "FULL"
        ? calcWorkingDays(it.startDate, it.endDate, holidays)
        : 0.5;
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
        days = calcWorkingDays(newStart, newEnd, holidays);
      } else if (pol && pol.allowsHalfDay && !pol.allowsFullDay && pol.halfDayAmPm === "BOTH") {
        days = ts === "AM" || ts === "PM" ? 0.5 : 0;
      } else if (pol && pol.allowsFullDay && pol.allowsHalfDay) {
        days = ts === "FULL" ? calcWorkingDays(newStart, newEnd, holidays) : (ts === "AM" || ts === "PM" ? 0.5 : 0);
      }
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

  // ── 달력 팝업 (시작일 클릭 → 종료일 클릭, 네이버 비행기 스타일) ──
  const [calendarItemIdx, setCalendarItemIdx] = useState<number | null>(null);
  const [calendarStep, setCalendarStep] = useState<"start" | "end">("start");
  const [calendarPickedStart, setCalendarPickedStart] = useState<string | null>(null);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth() + 1);

  function openCalendar(idx: number) {
    const it = items[idx];
    if (!it) return;
    setCalendarItemIdx(idx);
    setCalendarStep("start");
    setCalendarPickedStart(null);
    const [y, m] = it.startDate.split("-").map(Number);
    setCalendarYear(y);
    setCalendarMonth(m);
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
  const totalDays = effectiveSubmitItems.reduce((s, it) => {
    const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
    if (!lt) return s;
    return s + leaveItemDeductDays({ days: it.days, timeSlot: it.timeSlot }, lt);
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
      const actualDays = lt?.isHalf ? 0.5 : it.days;
      if (actualDays <= 0) { setError("휴가 일수를 확인해 주세요."); return; }
      if (lt?.code === "PM_RECOG_STAMP" && afternoonStampSlots < 1) {
        setError(`${lt.name}: 10칸 완성·오후 미사용인 스탬프 장이 없습니다.`);
        return;
      }
      if (lt?.requiresStamp && lt.stampCount && lt.code !== "PM_RECOG_STAMP") {
        if (totalStamps < (lt.stampCount ?? 0)) {
          setError(`${lt.name}: 스탬프 ${lt.stampCount}개 필요 (현재 ${totalStamps}개)`);
          return;
        }
      }
      if (lt?.code === "PM_HALF_MONTH" && halfDayUsed >= 1) {
        setError("하프데이는 이번 달 이미 사용하셨습니다."); return;
      }
      if (lt?.deductFromBalance && annualPoolRemaining < actualDays) {
        setError(`잔여 연차 부족 — 신청 ${actualDays}일, 잔여 ${annualPoolRemaining.toFixed(1)}일`); return;
      }
    }
    const dedicatedTotals: Record<string, number> = {};
    for (const it of items) {
      if (!needsLeaveRowValidation(it)) continue;
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      const src = lt?.allocationSourceCode?.trim();
      if (!lt || !src) continue;
      const d = leaveItemDeductDays(it, lt);
      dedicatedTotals[src] = (dedicatedTotals[src] ?? 0) + d;
    }
    for (const [src, need] of Object.entries(dedicatedTotals)) {
      const rem = poolRemainingBySource[src] ?? 0;
      if (need > rem) {
        setError(`「${src}」부여 잔여 부족 — 신청 ${need.toFixed(1)}일, 잔여 ${rem.toFixed(1)}일`); return;
      }
    }
    const overlap = detectOverlap(items, leaveTypes);
    if (overlap) { setError(overlap); return; }

    setLoading(true);
    const payload = items.filter(includeInLeaveRequestPayload).map((it) => {
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId)!;
      const days = leaveItemDeductDays({ days: it.days, timeSlot: it.timeSlot }, lt);
      const timeSlot = resolveItemTimeSlot({ timeSlot: it.timeSlot }, leaveTypeWithPolicy(lt));
      return { ...it, allocationId: "", days, timeSlot };
    });
    const res  = await fetch("/api/leave/request", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: payload }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "신청 중 오류 발생"); return; }
    router.push("/leave/my?applied=1");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {items.map((item, idx) => {
        const lt        = leaveTypes.find((t) => t.id === item.leaveTypeId);
        const grp       = LEAVE_GROUPS.find((g) => g.key === item._groupKey);
        const actualDays = lt ? leaveItemDeductDays({ days: item.days, timeSlot: item.timeSlot }, lt) : 0;
        const polUi     = lt ? leaveTypeWithPolicy(lt) : null;
        const isAnnualDeduct = lt?.deductFromBalance ?? false;

        return (
          <div key={idx} className="panel overflow-hidden">
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
                      <span className="ml-2 text-xs font-bold text-gray-800">{actualDays}일</span>
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
                      {LEAVE_GROUPS_ASSET.map((g) => {
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
                            <span className="text-xs text-gray-500 mt-1 leading-tight">{g.meta}</span>
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
                      {LEAVE_GROUPS_REASON.map((g) => {
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
                            <span className="text-xs text-gray-500 mt-1 leading-tight">{g.meta}</span>
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

                {/* 스탬프 > 힐링데이: 전용 경로 안내 (일수 표기 없음, 1시간 40분 개념) */}
                {item._groupKey === "stamp" && item._healingSelected && (
                  <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-800 mb-1">힐링데이 — 스탬프 쿠폰 메뉴에서 신청</p>
                    <p className="text-xs text-amber-700 mb-3 leading-relaxed">
                      스탬프 5개 소진 시 10:20 출근 또는 16:00 퇴근(1시간 40분 단축)으로 처리됩니다.
                      결재 없이 자동 등록되며, 연차 일수에 포함되지 않습니다.
                    </p>
                    <a href="/stamp" target="_blank"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 underline hover:text-amber-900">
                      <ExternalLink size={12} />
                      스탬프 쿠폰 페이지로 이동
                    </a>
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
                          className={`flex-1 flex flex-col items-center py-3 rounded-lg border transition-all ${
                            item.timeSlot === k
                              ? "border-2 bg-white shadow-sm"
                              : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                          }`}
                          style={item.timeSlot === k ? { borderColor: grp?.color ?? "#3b82f6" } : {}}>
                          <span className={`text-sm font-semibold ${item.timeSlot === k ? "" : "text-gray-700"}`}
                            style={item.timeSlot === k ? { color: grp?.color ?? "#3b82f6" } : {}}>
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
                        const isHealing = sub.code === "HEALING";
                        const isSelected = isHealing ? item._healingSelected : lt?.code === sub.code;
                        return (
                          <button key={sub.code} type="button"
                            onClick={() => selectLeaveType(idx, sub.code, grp.key)}
                            disabled={!isHealing && !subLt}
                            className={`flex-1 flex flex-col items-center py-3 rounded-lg border transition-all ${
                              isSelected
                                ? "border-2 bg-white shadow-sm"
                                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                            style={isSelected ? { borderColor: grp.color } : {}}>
                            <span className={`text-sm font-semibold ${isSelected ? "" : "text-gray-700"}`}
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

                {/* STEP 3: 신청 기간 */}
                {item.leaveTypeId && (!polUi?.allowsFullDay || !polUi?.allowsHalfDay || ["FULL", "AM", "PM"].includes(item.timeSlot ?? "")) && (() => {
                  const dual = !!(polUi?.allowsFullDay && polUi?.allowsHalfDay);
                  const pol = lt ? leaveTypeWithPolicy(lt) : null;
                  const singleDayField = lt
                    ? rowUsesSingleDayOnly(item, lt)
                    || !!(pol?.allowsHalfDay && !pol.allowsFullDay)
                    || (dual && item.timeSlot !== "FULL" && (item.timeSlot === "AM" || item.timeSlot === "PM"))
                    : false;
                  return (
                  <section>
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {grp && grp.subs.length > 1 ? "03." : "02."} 신청 기간
                    </p>
                    <div className={`grid gap-3 ${singleDayField ? "grid-cols-1" : "grid-cols-2"}`}>
                      <div>
                        <label className="block text-sm text-gray-500 mb-1">
                          {singleDayField ? "날짜" : "시작일"}
                        </label>
                        <input type="date" className="input"
                          value={item.startDate}
                          onChange={(e) => changeDate(idx, "startDate", e.target.value)}
                          required />
                      </div>
                      {!singleDayField && (
                        <div>
                          <label className="block text-sm text-gray-500 mb-1">종료일</label>
                          <input type="date" className="input"
                            value={item.endDate} min={item.startDate}
                            onChange={(e) => changeDate(idx, "endDate", e.target.value)}
                            required />
                        </div>
                      )}
                    </div>
                    <div className="mt-2">
                      <button type="button"
                        onClick={() => openCalendar(idx)}
                        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
                        <Calendar size={16} />
                        달력에서 선택
                      </button>
                    </div>

                    {/* 일수 카운터 (힐링데이는 스탬프 페이지에서만 사용, 여기서는 연차/반차/하프데이 등) */}
                    {lt?.code === "PM_HALF_MONTH" && (
                      <p className="mt-2 text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                        하프데이는 <strong>수요일 오후</strong>에만 사용 가능합니다.
                      </p>
                    )}
                    <div className={`mt-2 px-3 py-2 rounded-lg flex items-center gap-2 text-sm ${
                      actualDays > 0
                        ? "bg-blue-50 border border-blue-100 text-blue-700"
                        : "bg-gray-50 border border-gray-200 text-gray-400"
                    }`}>
                      {lt && (resolveItemTimeSlot({ timeSlot: item.timeSlot }, leaveTypeWithPolicy(lt)) === "AM" || resolveItemTimeSlot({ timeSlot: item.timeSlot }, leaveTypeWithPolicy(lt)) === "PM") ? (
                        <span>
                          {resolveItemTimeSlot({ timeSlot: item.timeSlot }, leaveTypeWithPolicy(lt)) === "AM" ? "오전" : "오후"}{" "}
                          <strong>0.5일</strong>
                          <span className="ml-2 text-xs opacity-70">(반일 근무)</span>
                        </span>
                      ) : actualDays > 0 ? (
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
                            연차 (기본 {annualPoolAllocs.find(a => a.sourceCode === "BASE_ANNUAL")?.totalDays ?? 0} · 근속 {annualPoolAllocs.find(a => a.sourceCode === "TENURE_BONUS")?.totalDays ?? 0} · 이월 {annualPoolAllocs.find(a => a.sourceCode === "CARRYOVER")?.totalDays ?? 0})
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
                          <span className="ml-1">(10칸 완성 장 필요)</span>
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
                      : lt.approvalSteps === 1
                      ? "팀장 1단계 결재"
                      : "팀장 → PM 2단계 결재"}
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
      {totalDays > 0 && (
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
              const t = leaveTypes.find((t) => t.id === it.leaveTypeId);
              if (!t) return null;
              const g = LEAVE_GROUPS.find((g) => g.key === it._groupKey);
              const slot = resolveItemTimeSlot({ timeSlot: it.timeSlot }, leaveTypeWithPolicy(t));
              const slotLabel = slot === "FULL" ? "종일" : slot === "AM" ? "오전" : "오후";
              const d = leaveItemDeductDays({ days: it.days, timeSlot: it.timeSlot }, t);
              return (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: g?.color ?? "#94a3b8" }} />
                    <div>
                      <span className="text-[13px] font-medium text-gray-800">
                        {g?.label} · {slotLabel}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {it.startDate === it.endDate
                          ? ymdWithDay(it.startDate)
                          : `${ymdWithDay(it.startDate)} ~ ${ymdWithDay(it.endDate)}`}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-800 tabular-nums">{d}일</span>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 flex items-center justify-between border-t border-slate-200 bg-white">
            <div>
              <span className="text-xs text-gray-500">합계</span>
              <span className="ml-2 text-lg font-black text-blue-700">
                {totalDays.toFixed(1)}<span className="text-sm font-normal ml-0.5">일</span>
              </span>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => router.back()}
                className="btn-secondary btn-sm px-4">취소</button>
              <button type="submit" disabled={loading || totalDays <= 0}
                className="btn-primary btn-sm px-6">
                {loading ? (
                  <><span className="spinner" /><span>신청 중…</span></>
                ) : (
                  `${totalDays.toFixed(1)}일 신청하기`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 신청 요약 없을 때 하단 버튼 */}
      {totalDays <= 0 && (
        <div className="flex gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary flex-1">취소</button>
          <button type="submit" disabled className="btn-primary flex-1 opacity-40 cursor-not-allowed">
            휴가 유형과 기간을 선택하세요
          </button>
        </div>
      )}

      {/* 달력 팝업: 시작일 클릭 → 종료일 클릭 */}
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
        const today = todayStr();
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
          if (calendarMonth === 1) {
            setCalendarMonth(12);
            setCalendarYear((y) => y - 1);
          } else setCalendarMonth((m) => m - 1);
        };
        const nextMonth = () => {
          if (calendarMonth === 12) {
            setCalendarMonth(1);
            setCalendarYear((y) => y + 1);
          } else setCalendarMonth((m) => m + 1);
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={closeCalendar}>
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">
                  {calendarStep === "start"
                    ? (isHalf ? "날짜 선택" : "시작일 선택")
                    : "종료일 선택"}
                </h3>
                <button type="button" onClick={closeCalendar}
                  className="text-gray-400 hover:text-gray-600 p-1">✕</button>
              </div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <button type="button" onClick={prevMonth}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-600">‹</button>
                <span className="text-sm font-semibold tabular-nums">
                  {calendarYear}년 {calendarMonth}월
                </span>
                <button type="button" onClick={nextMonth}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-600">›</button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {weekDays.map((w) => (
                  <div key={w} className="text-[10px] font-medium text-gray-400 py-1">{w}</div>
                ))}
                {cells.map((dateStr, i) => {
                  if (!dateStr) return <div key={`e-${i}`} />;
                  const isPast = dateStr < today;
                  const isStart = dateStr === start;
                  const isInRange = calendarStep === "end" && start && dateStr >= start;
                  return (
                    <button key={dateStr} type="button"
                      onClick={() => onCalendarDateClick(dateStr)}
                      className={`aspect-square rounded text-sm font-medium transition-colors ${
                        isStart
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : isInRange
                            ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                            : isPast
                              ? "text-gray-500 hover:bg-gray-100"
                              : "text-gray-700 hover:bg-gray-100"
                      }`}>
                      {dateStr.slice(8, 10)}
                    </button>
                  );
                })}
              </div>
              {calendarStep === "end" && (
                <p className="mt-3 text-xs text-gray-500 text-center">
                  종료일을 클릭하세요 (같은 날 클릭 시 1일)
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </form>
  );
}

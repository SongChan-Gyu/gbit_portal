"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { calcWorkingDays, todayStr } from "@/lib/workdays";
import { formatYMD } from "@/lib/dateUtils";
import { ChevronRight, Info, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";

// ── 타입 ──────────────────────────────────────────────────────
interface LT {
  id: string; code: string; name: string; daysPerUnit: number;
  deductFromBalance: boolean; approvalSteps: number;
  maxPerMonth: number | null; requiresStamp: boolean; stampCount: number | null;
  isHalf: boolean; isAmOnly: boolean; isPmOnly: boolean; color: string;
}
interface Alloc {
  id: string; sourceCode: string; label: string; totalDays: number; usedDays: number;
  validFrom: string; validUntil: string;
}
interface Stamp { id: string; stampDate: string; }

interface LeaveItem {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  _groupKey: string;
}

function initItem(startDate = todayStr()): LeaveItem {
  return { leaveTypeId: "", startDate, endDate: startDate, days: 0, reason: "", _groupKey: "" };
}

// ── 연차 = 기본연차 + 근속가산 + 이월연차만 (특별휴가·부서추가 제외) ──
const ANNUAL_ONLY_SOURCES = new Set([
  "BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER",
]);
const CARE_TYPE_CODES = new Set(["CARE", "CARE_AM", "CARE_PM"]);
const HOLIDAY_EXT_TYPE_CODES = new Set(["HOLIDAY_EXT"]);
const BIRTHDAY_HALF_TYPE_CODES = new Set(["BIRTHDAY_HALF"]);
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
      { label: "오전반차", code: "AM_HALF",  desc: "오전 4시간" },
      { label: "오후반차", code: "PM_HALF",  desc: "오후 4시간" },
    ],
  },
  {
    key: "recognition", label: "인정휴가", meta: "차감없음",
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
    key: "holidayExt", label: "연휴연장휴가", meta: "귀속연도 1일 (1일 단위만)",
    color: "#0ea5e9", borderClass: "border-sky-500",
    subs: [{ label: "1일", code: "HOLIDAY_EXT", desc: "연휴 3일 이상 시 앞뒤 연속일 사용 가능" }],
  },
  {
    key: "healing", label: "힐링데이", meta: "스탬프 5개",
    color: "#d97706", borderClass: "border-amber-500",
    subs: [],   // 전용 페이지(스탬프 쿠폰)에서 신청
  },
  {
    key: "sick", label: "병가", meta: "미차감 (급여만 감액)",
    color: "#dc2626", borderClass: "border-red-500",
    subs: [{ label: "신청", code: "SICK" }],
  },
  {
    key: "halfstamp", label: "하프데이·스탬프", meta: "오후 조기퇴근",
    color: "#0284c7", borderClass: "border-sky-500",
    subs: [
      { label: "하프데이",     code: "PM_HALF_MONTH", desc: "월 1회" },
      { label: "오후인정(스탬프)", code: "PM_RECOG_STAMP", desc: "스탬프 10개" },
    ],
  },
  {
    key: "award", label: "포상휴가", meta: "별도 부여",
    color: "#7c3aed", borderClass: "border-violet-500",
    subs: [{ label: "신청", code: "AWARD" }],
  },
  {
    key: "birthday", label: "생일반차", meta: "생일 해당 월 자동 부여",
    color: "#ec4899", borderClass: "border-pink-500",
    subs: [{ label: "오후 반차", code: "BIRTHDAY_HALF", desc: "0.5일" }],
  },
];

const CODE_TO_GROUP: Record<string, string> = {};
LEAVE_GROUPS.forEach((g) => g.subs.forEach((s) => { CODE_TO_GROUP[s.code] = g.key; }));

// ── 중복 체크 ─────────────────────────────────────────────────
function detectOverlap(items: LeaveItem[], leaveTypes: LT[]): string | null {
  const byDate: Record<string, { am: boolean; pm: boolean; full: boolean }> = {};
  for (const item of items) {
    if (!item.leaveTypeId || !item.startDate) continue;
    const lt = leaveTypes.find((t) => t.id === item.leaveTypeId);
    if (!lt) continue;
    const cur = new Date(item.startDate);
    const end = new Date(item.endDate);
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10);
      if (!byDate[key]) byDate[key] = { am: false, pm: false, full: false };
      const slot = byDate[key];
      if (!lt.isHalf) {
        if (slot.full || slot.am || slot.pm) return `${key}: 날짜 중복 신청입니다.`;
        slot.full = true;
      } else if (lt.isAmOnly) {
        if (slot.full || slot.am) return `${key}: 오전 시간대 중복입니다.`;
        slot.am = true;
      } else {
        if (slot.full || slot.pm) return `${key}: 오후 시간대 중복입니다.`;
        slot.pm = true;
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  return null;
}

// ── 컴포넌트 ──────────────────────────────────────────────────
export default function LeaveApplyForm({
  leaveTypes, allocations, stamps, halfDayUsed, holidays,
}: {
  leaveTypes: LT[];
  allocations: Alloc[];
  stamps: Stamp[];
  halfDayUsed: number;
  holidays: string[];
  employeeId: string;
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
  const carePoolRemaining = useMemo(
    () => allocations
      .filter((a) => a.sourceCode === "CARE" && a.validUntil >= now)
      .reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0),
    [allocations, now]
  );
  const holidayExtPoolRemaining = useMemo(
    () => allocations
      .filter((a) => a.sourceCode === "HOLIDAY_EXT" && a.validUntil >= now)
      .reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0),
    [allocations, now]
  );
  const birthdayHalfPoolRemaining = useMemo(
    () => allocations
      .filter((a) => a.sourceCode === "BIRTHDAY_HALF" && a.validUntil >= now)
      .reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0),
    [allocations, now]
  );

  // ── 아이템 조작 ───────────────────────────────────────────
  function selectGroup(idx: number, groupKey: string) {
    const grp = LEAVE_GROUPS.find((g) => g.key === groupKey);
    if (!grp) return;
    if (grp.key === "healing") {
      setItems((prev) => prev.map((it, i) =>
        i === idx ? { ...it, leaveTypeId: "", _groupKey: groupKey, days: 0 } : it
      ));
      return;
    }
    // 서브옵션이 1개여도 먼저 _groupKey를 설정해 카드가 선택된 것처럼 보이게 함 (클릭 반응)
    setItems((prev) => prev.map((it, i) =>
      i === idx ? { ...it, leaveTypeId: "", _groupKey: groupKey, days: 0 } : it
    ));
    if (grp.subs.length === 1) {
      selectLeaveType(idx, grp.subs[0].code, groupKey);
    }
  }

  function selectLeaveType(idx: number, code: string, groupKey?: string) {
    const lt = ltByCode[code];
    if (!lt) return;
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const days = lt.isHalf ? 0.5 : calcWorkingDays(it.startDate, it.endDate, holidays);
      return {
        ...it, leaveTypeId: lt.id,
        _groupKey: groupKey ?? CODE_TO_GROUP[code] ?? it._groupKey,
        days,
        endDate: lt.isHalf ? it.startDate : it.endDate,
      };
    }));
  }

  function changeDate(idx: number, field: "startDate" | "endDate", value: string) {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      const newStart = field === "startDate" ? value : it.startDate;
      const newEnd   = field === "endDate"   ? value : (lt?.isHalf ? newStart : it.endDate);
      const days     = lt?.isHalf ? 0.5 : calcWorkingDays(newStart, newEnd, holidays);
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

  const totalDays = items.reduce((s, it) => s + (it.days || 0), 0);
  const maxSteps  = items.reduce((m, it) => {
    const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
    return Math.max(m, lt?.approvalSteps ?? 1);
  }, 1);

  // ── 제출 ──────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    for (const it of items) {
      if (!it.leaveTypeId) { setError("모든 항목의 휴가 유형을 선택해 주세요."); return; }
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      const actualDays = lt?.isHalf ? 0.5 : it.days;
      if (actualDays <= 0) { setError("휴가 일수를 확인해 주세요."); return; }
      if (lt?.requiresStamp && lt.stampCount && stamps.length < lt.stampCount) {
        setError(`${lt.name}: 스탬프 ${lt.stampCount}개 필요 (현재 ${stamps.length}개)`); return;
      }
      if (lt?.code === "PM_HALF_MONTH" && halfDayUsed >= 1) {
        setError("하프데이는 이번 달 이미 사용하셨습니다."); return;
      }
      if (lt?.deductFromBalance && annualPoolRemaining < actualDays) {
        setError(`잔여 연차 부족 — 신청 ${actualDays}일, 잔여 ${annualPoolRemaining.toFixed(1)}일`); return;
      }
      if (lt && CARE_TYPE_CODES.has(lt.code) && carePoolRemaining < actualDays) {
        setError(`돌봄휴가 잔여 부족 — 연 2일 한도, 잔여 ${carePoolRemaining.toFixed(1)}일`); return;
      }
      if (lt && HOLIDAY_EXT_TYPE_CODES.has(lt.code) && (actualDays !== 1 || holidayExtPoolRemaining < 1)) {
        setError(`연휴연장휴가는 1일 단위만 사용 가능하며, 잔여 ${holidayExtPoolRemaining.toFixed(1)}일입니다.`); return;
      }
      if (lt && BIRTHDAY_HALF_TYPE_CODES.has(lt.code) && (actualDays !== 0.5 || birthdayHalfPoolRemaining < 0.5)) {
        setError(`생일반차 잔여 부족 (0.5일, 잔여 ${birthdayHalfPoolRemaining.toFixed(1)}일)`); return;
      }
    }
    const careDaysSum = items.reduce((s, it) => {
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      return lt && CARE_TYPE_CODES.has(lt.code) ? s + (lt.isHalf ? 0.5 : (it.days || 0)) : s;
    }, 0);
    if (careDaysSum > 0 && careDaysSum > carePoolRemaining) {
      setError(`돌봄휴가 잔여 부족 — 신청 ${careDaysSum.toFixed(1)}일, 잔여 ${carePoolRemaining.toFixed(1)}일`); return;
    }
    const holidayExtDaysSum = items.reduce((s, it) => {
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      return lt && HOLIDAY_EXT_TYPE_CODES.has(lt.code) ? s + 1 : s;
    }, 0);
    if (holidayExtDaysSum > 0 && holidayExtDaysSum > holidayExtPoolRemaining) {
      setError(`연휴연장휴가 잔여 부족 — 신청 ${holidayExtDaysSum}일, 잔여 ${holidayExtPoolRemaining.toFixed(1)}일`); return;
    }
    const overlap = detectOverlap(items, leaveTypes);
    if (overlap) { setError(overlap); return; }

    setLoading(true);
    const payload = items.map((it) => {
      const lt = leaveTypes.find((t) => t.id === it.leaveTypeId);
      return { ...it, allocationId: "", days: lt?.isHalf ? 0.5 : it.days };
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
        const actualDays = lt?.isHalf ? 0.5 : item.days;
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
                <section>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                    01. 휴가 종류
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 sm:gap-1.5">
                    {LEAVE_GROUPS.map((g) => {
                      const isSelected = item._groupKey === g.key;
                      return (
                        <button key={g.key} type="button"
                          onClick={() => selectGroup(idx, g.key)}
                          className={`flex flex-col items-center justify-center p-3 md:p-2.5 rounded-lg border text-center transition-all ${
                            isSelected
                              ? "border-2 bg-white shadow-sm"
                              : "border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50"
                          }`}
                          style={isSelected ? { borderColor: g.color } : {}}>
                          <span className={`text-[15px] md:text-[11px] font-semibold leading-tight ${
                            isSelected ? "" : "text-gray-600"
                          }`} style={isSelected ? { color: g.color } : {}}>
                            {g.label}
                          </span>
                          <span className="text-xs md:text-[10px] text-gray-500 mt-0.5 leading-tight">{g.meta}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* 그룹은 선택됐지만 휴가 유형 미등록 시 (연휴연장/생일반차 등) */}
                {item._groupKey && item._groupKey !== "healing" && grp && grp.subs.length === 1 && !item.leaveTypeId && (
                  <section className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">
                      <strong>{grp.label}</strong> 휴가 유형이 시스템에 등록되지 않았습니다.
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      관리자 &gt; 휴가 유형 설정에서 해당 유형을 추가하거나, DB 시드를 실행해 주세요.
                    </p>
                  </section>
                )}

                {/* 힐링데이: 전용 경로 안내 */}
                {item._groupKey === "healing" && (
                  <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-800 mb-1">힐링데이 — 스탬프 쿠폰 메뉴에서 신청</p>
                    <p className="text-xs text-amber-700 mb-3 leading-relaxed">
                      힐링데이는 스탬프 5개 소진 후 오후 4시 조기퇴근으로 처리됩니다.
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
                {item._groupKey && item._groupKey !== "healing" && grp && grp.subs.length > 1 && (
                  <section>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                      02. 시간대
                    </p>
                    <div className="flex gap-2">
                      {grp.subs.map((sub) => {
                        const subLt = ltByCode[sub.code];
                        const isSelected = lt?.code === sub.code;
                        return (
                          <button key={sub.code} type="button"
                            onClick={() => selectLeaveType(idx, sub.code)}
                            disabled={!subLt}
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
                              <span className="text-[10px] text-gray-400 mt-0.5">{sub.desc}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* STEP 3: 신청 기간 */}
                {item.leaveTypeId && (
                  <section>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                      {grp && grp.subs.length > 1 ? "03." : "02."} 신청 기간
                    </p>
                    <div className={`grid gap-3 ${lt?.isHalf ? "grid-cols-1" : "grid-cols-2"}`}>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          {lt?.isHalf ? "날짜" : "시작일"}
                        </label>
                        <input type="date" className="input"
                          value={item.startDate}
                          onChange={(e) => changeDate(idx, "startDate", e.target.value)}
                          required />
                      </div>
                      {!lt?.isHalf && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">종료일</label>
                          <input type="date" className="input"
                            value={item.endDate} min={item.startDate}
                            onChange={(e) => changeDate(idx, "endDate", e.target.value)}
                            required />
                        </div>
                      )}
                    </div>

                    {/* 일수 카운터 */}
                    <div className={`mt-2 px-3 py-2 rounded-lg flex items-center gap-2 text-sm ${
                      actualDays > 0
                        ? "bg-blue-50 border border-blue-100 text-blue-700"
                        : "bg-gray-50 border border-gray-200 text-gray-400"
                    }`}>
                      {lt?.isHalf ? (
                        <span>
                          {lt.isAmOnly ? "오전" : "오후"} <strong>0.5일</strong>
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
                )}

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
                      {annualPoolAllocs.filter(a => a.totalDays - a.usedDays > 0).map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-xs text-orange-700">
                          <span className="truncate mr-3">{a.label}</span>
                          <span className="shrink-0 tabular-nums">
                            잔여 {(a.totalDays - a.usedDays).toFixed(1)}일
                            <span className="text-orange-400 ml-1.5">
                              ~{formatYMD(a.validUntil)}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                    {annualPoolRemaining < actualDays && actualDays > 0 && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600 font-medium">
                        <AlertCircle size={12} />
                        잔여 연차가 부족합니다
                      </div>
                    )}
                  </section>
                )}

                {/* 스탬프 현황 */}
                {lt?.requiresStamp && item.leaveTypeId && (
                  <section className="rounded-lg border border-purple-100 bg-purple-50/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-purple-800">스탬프 현황</span>
                      <span className={`text-xs font-semibold ${
                        stamps.length >= (lt.stampCount ?? 0) ? "text-emerald-600" : "text-purple-600"
                      }`}>
                        {stamps.length} / {lt.stampCount}개
                        {stamps.length >= (lt.stampCount ?? 0)
                          ? <span className="ml-1">✓ 사용 가능</span>
                          : <span className="ml-1">— {(lt.stampCount ?? 0) - stamps.length}개 부족</span>
                        }
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: lt.stampCount ?? 10 }).map((_, i) => (
                        <span key={i} className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          i < stamps.length ? "bg-amber-400 text-white" : "bg-gray-200 text-gray-300"
                        }`}>
                          {i < stamps.length ? "★" : "☆"}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {/* STEP: 사유 */}
                {item.leaveTypeId && (
                  <section>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">
                      사유
                      {!isAnnualDeduct && (
                        <span className="ml-1 text-[10px] normal-case font-normal text-gray-400">(선택)</span>
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
              {maxSteps === 0 ? "즉시 처리" : maxSteps === 1 ? "팀장 1단계" : "팀장 → PM 2단계"} 결재
            </span>
          </div>
          <div className="divide-y divide-slate-200">
            {items.map((it, i) => {
              const t = leaveTypes.find((t) => t.id === it.leaveTypeId);
              if (!t) return null;
              const g = LEAVE_GROUPS.find((g) => g.key === it._groupKey);
              const d = t.isHalf ? 0.5 : it.days;
              return (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: g?.color ?? "#94a3b8" }} />
                    <div>
                      <span className="text-[13px] font-medium text-gray-800">
                        {g?.label} · {t.isHalf
                          ? (g?.key === "annual"
                              ? (t.isAmOnly ? "오전반차" : "오후반차")
                              : (t.isAmOnly ? "오전" : "오후"))
                          : "종일"}
                      </span>
                      <span className="text-xs text-gray-400 ml-2">
                        {it.startDate === it.endDate
                          ? it.startDate
                          : `${it.startDate} ~ ${it.endDate}`}
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
    </form>
  );
}

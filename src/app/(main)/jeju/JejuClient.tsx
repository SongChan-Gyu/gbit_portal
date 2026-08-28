"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  formatJejuAccountNumber,
  calcNights,
  isJejuDateBookable,
  jejuKstMidnightFromYmdStr,
  jejuPeriodTouchesBlockedYmds,
  JEJU_MAX_NIGHTS_DEFAULT,
} from "@/lib/jeju";
import { addDaysYMD, calendarUtcDowFromYMD, dowLabelKoFromYmd, todayKstYmd } from "@/lib/dateUtils";
import {
  buildHolidayDisplaySet,
  isRedCalendarDay,
  CALENDAR_HOLIDAY_COLOR,
} from "@/lib/calendarHolidayDisplay";
import {
  formatJejuYearStatsSummary,
  formatJejuYearlyUsageLimitError,
  JEJU_YEARLY_HIGH_SUBMISSION_HINT,
  JEJU_YEARLY_SUBMIT_WARN_THRESHOLD,
  JEJU_YEARLY_USAGE_POLICY_NOTE,
  type JejuCalendarYearStats,
  type JejuYearlyUsageInfo,
} from "@/lib/jejuYearStats";
import { JejuRefundPolicyNotice } from "@/components/jeju/JejuRefundPolicyNotice";

type JejuConfig = {
  maxNights: number;
  checkIn: string;
  checkOut: string;
  bookingWindowEnd: string;
  depositAmount?: number;
  depositAccount?: { bankName: string; accountHolder: string; accountNumber: string };
  blockedDates?: string[];
  depositDeadlineDays?: number;
};

type ListRequest = {
  id: string;
  startDate: string;
  endDate: string;
  nights: number;
  status: string;
  employeeName: string;
  empNo: string;
  teamName: string | null;
  reason: string | null;
};

function getMonthRange(year: number, month: number) {
  const m = String(month).padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${m}-01`,
    to: `${year}-${m}-${String(last).padStart(2, "0")}`,
  };
}

function nightsBetween(startYmd: string, endYmd: string): number {
  let n = 0;
  let cur = startYmd.slice(0, 10);
  const end = endYmd.slice(0, 10);
  while (cur < end) {
    n++;
    cur = addDaysYMD(cur, 1);
  }
  return n;
}

/** 입실일 S 기준 선택 가능한 퇴실일 (1박~maxNights박, [S,E) 구간에 예약/블록 없음). 퇴실일은 시작일 한도와 무관하게 S+1~S+maxNights까지 허용 */
function getValidCheckOutDates(
  checkInYmd: string,
  occupiedDates: string[],
  blockedSet: Set<string>,
  maxNights: number
): string[] {
  const out: string[] = [];
  const occupiedSet = new Set(occupiedDates);
  for (let n = 1; n <= maxNights; n++) {
    const eStr = addDaysYMD(checkInYmd, n);
    let ok = true;
    let walk = checkInYmd;
    while (walk !== eStr) {
      if (occupiedSet.has(walk) || blockedSet.has(walk)) {
        ok = false;
        break;
      }
      walk = addDaysYMD(walk, 1);
    }
    if (ok) out.push(eStr);
  }
  return out;
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.statusText))));

async function fetchMyJejuForYearStats(url: string): Promise<{
  yearStats: JejuCalendarYearStats | null;
  yearlyUsage: JejuYearlyUsageInfo | null;
}> {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) return { yearStats: null, yearlyUsage: null };
  const j = (await r.json()) as {
    yearStats?: JejuCalendarYearStats;
    yearlyUsage?: JejuYearlyUsageInfo;
    requests?: unknown;
  };
  if (j?.yearStats && typeof j.yearStats.year === "number") {
    return { yearStats: j.yearStats, yearlyUsage: j.yearlyUsage ?? null };
  }
  return { yearStats: null, yearlyUsage: null };
}

export default function JejuClient({
  welfare,
  holidayYmds,
}: {
  welfare: boolean;
  holidayYmds: string[];
}) {
  const router = useRouter();
  const todayYmd = todayKstYmd();
  const [ty, tm] = todayYmd.split("-").map((x) => parseInt(x, 10));
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm);
  const { from, to } = getMonthRange(year, month);
  const { data: occupied = { welfare: false }, isLoading: loadingOccupied, mutate: mutateOccupied } = useSWR(
    `/api/jeju/occupied-dates?from=${from}&to=${to}`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: allListRaw, isLoading: loadingRequests, mutate: mutateRequests } = useSWR<ListRequest[]>(
    welfare ? "/api/jeju/requests" : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: config } = useSWR<JejuConfig>("/api/jeju/config", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const { data: myJejuPayload, mutate: mutateMyJeju } = useSWR("/api/jeju/my", fetchMyJejuForYearStats, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const yearStats = myJejuPayload?.yearStats ?? null;
  const yearlyUsage = myJejuPayload?.yearlyUsage ?? null;
  const allList = allListRaw ?? [];
  const loading = loadingOccupied || (welfare && loadingRequests);
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [applyGuestName, setApplyGuestName] = useState("");
  const [applyGuestPhone, setApplyGuestPhone] = useState("");
  // 모바일에서 number input을 편집할 때(지우고 다시 입력) 값이 강제로 되돌아가 편집이 막히는 케이스가 있어 문자열로 유지
  const [applyGuestCount, setApplyGuestCount] = useState("1");
  const [applyDepositorName, setApplyDepositorName] = useState("");
  const [applyReason, setApplyReason] = useState("");
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applyError, setApplyError] = useState("");


  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1);
  };

  const occupiedDates = (occupied.occupiedDates ?? []) as string[];
  const blockedSet = new Set<string>(occupied.blockedDates ?? []);
  const windowEndYmd = config?.bookingWindowEnd ?? todayYmd;
  const maxNights = config?.maxNights ?? JEJU_MAX_NIGHTS_DEFAULT;

  const validCheckOutDates = useMemo(() => {
    if (!checkInDate) return [];
    return getValidCheckOutDates(checkInDate, occupiedDates, blockedSet, maxNights);
  }, [checkInDate, occupiedDates, blockedSet, maxNights]);

  const holidaySet = useMemo(() => buildHolidayDisplaySet(holidayYmds), [holidayYmds]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = calendarUtcDowFromYMD(`${year}-${String(month).padStart(2, "0")}-01`);
  const calendarDays: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  const DAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

  function handleDayClick(dateStr: string) {
    const isBlocked = blockedSet.has(dateStr);
    const isOccupied = occupiedDates.includes(dateStr);
    const canBeCheckIn = !isBlocked && !isOccupied && dateStr <= windowEndYmd;

    if (!checkInDate) {
      if (canBeCheckIn) setCheckInDate(dateStr);
      return;
    }
    if (checkOutDate) {
      if (canBeCheckIn) {
        setCheckInDate(dateStr);
        setCheckOutDate("");
      }
      return;
    }
    if (dateStr === checkInDate) {
      setCheckInDate("");
      return;
    }
    if (dateStr > checkInDate && validCheckOutDates.includes(dateStr)) {
      setCheckOutDate(dateStr);
      return;
    }
    if (dateStr < checkInDate && canBeCheckIn) {
      setCheckInDate(dateStr);
    }
  }

  function isDayValidCheckOut(d: string) {
    return !!checkInDate && validCheckOutDates.includes(d);
  }

  function isDayUnavailable(d: string) {
    const blocked = blockedSet.has(d);
    const occ = occupiedDates.includes(d);
    return blocked || occ || d > windowEndYmd;
  }

  /** 사용불가일·예약가능기간(2달 후 말일) 초과 → "예약불가" / 그 외 불가일은 상태 기반 라벨 */
  function getUnavailableLabel(dateStr: string, detail: { name: string; empNo: string; requestId: string }[] | false | undefined) {
    const blockedOrPast = blockedSet.has(dateStr) || dateStr > windowEndYmd;
    if (blockedOrPast) return "예약불가";
    if (Array.isArray(detail) && detail.length > 0) return detail.length > 1 ? `${detail[0].name} 외` : detail[0].name;
    return occupied.statusByDate?.[dateStr] ?? "신청중";
  }

  async function submitApply(e: React.FormEvent) {
    e.preventDefault();
    setApplyError("");
    if (yearlyUsage && !yearlyUsage.canSubmit) {
      setApplyError(formatJejuYearlyUsageLimitError(yearStats?.year ?? parseInt(todayYmd.slice(0, 4), 10)));
      return;
    }
    const start = checkInDate;
    const end = checkOutDate;
    if (!start || !end) {
      setApplyError("입실일·퇴실일을 달력에서 선택해 주세요.");
      return;
    }
    if (!applyGuestName.trim()) {
      setApplyError("이름을 입력해 주세요.");
      return;
    }
    if (!applyGuestPhone.trim()) {
      setApplyError("연락처를 입력해 주세요.");
      return;
    }
    if (!applyDepositorName.trim()) {
      setApplyError("입금자명을 입력해 주세요. (예약금 이체 시 사용)");
      return;
    }
    const count = parseInt(String(applyGuestCount).trim(), 10);
    if (!Number.isFinite(count) || count < 1) {
      setApplyError("입실 인원을 1명 이상 입력해 주세요.");
      return;
    }
    setApplySubmitting(true);
    const res = await fetch("/api/jeju/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        reason: applyReason || undefined,
        guestName: applyGuestName.trim(),
        guestPhone: applyGuestPhone.trim(),
        guestCount: count,
        depositorName: applyDepositorName.trim(),
      }),
    });
    const data = await res.json();
    setApplySubmitting(false);
    if (!res.ok) {
      setApplyError(data.error || "신청 실패");
      return;
    }
    setCheckInDate("");
    setCheckOutDate("");
    setApplyGuestName("");
    setApplyGuestPhone("");
    setApplyGuestCount("1");
    setApplyDepositorName("");
    setApplyReason("");
    mutateOccupied();
    mutateRequests();
    void mutateMyJeju();
    router.push("/jeju/my?applied=1");
    router.refresh();
  }

  const pendingCount = allList.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      {yearStats && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-2 shadow-sm">
          <p className="text-[13px] font-semibold text-slate-700 tabular-nums leading-snug">
            {formatJejuYearStatsSummary(
              yearStats.year,
              yearStats.submittedCount,
              yearStats.approvedStayInYearCount,
            )}
          </p>
          {yearlyUsage?.hint && (
            <p className="text-[13px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-snug">
              {yearlyUsage.hint}
            </p>
          )}
          {!yearlyUsage?.isUnlimited && yearStats && yearStats.submittedCount >= JEJU_YEARLY_SUBMIT_WARN_THRESHOLD && !yearlyUsage?.hint && (
            <p className="text-[13px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-snug">
              {JEJU_YEARLY_HIGH_SUBMISSION_HINT}
            </p>
          )}
          <p className="text-[12px] text-slate-500">{JEJU_YEARLY_USAGE_POLICY_NOTE}</p>
        </div>
      )}
      {/* 달력 */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* 달력 헤더 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button type="button" onClick={prevMonth} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <span className="font-bold text-gray-900 text-base">
            {year}년 {month}월
          </span>
          <button type="button" onClick={nextMonth} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>
        {config && (
          <div className="mx-4 mb-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-slate-600">
            <span>입실 <span className="font-semibold text-slate-900">15:00</span></span>
            <span>퇴실 <span className="font-semibold text-slate-900">11:00</span> <span className="text-slate-400">(고정)</span></span>
            <span>최대 <span className="font-semibold text-slate-900">{config.maxNights}박</span></span>
            <span>예약 가능 <span className="font-semibold text-slate-900">~{config.bookingWindowEnd}</span></span>
          </div>
        )}
        <div className="px-4 pb-4">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">로딩 중...</div>
        ) : (
          <div className="grid grid-cols-7 gap-1 text-sm">
            {DAYS_KO.map((d, wi) => (
              <div
                key={d}
                className={`text-center font-medium py-1 ${wi === 0 ? "text-red-500" : "text-gray-500"}`}
              >
                {d}
              </div>
            ))}
            {calendarDays.map((dateStr, i) => {
              if (!dateStr) return <div key={`e-${i}`} />;
              const unavailable = isDayUnavailable(dateStr);
              const validOut = isDayValidCheckOut(dateStr);
              const isChkIn = dateStr === checkInDate;
              const isChkOut = dateStr === checkOutDate;
              const clickable = !unavailable || validOut;
              const detail = occupied.welfare && occupied.byDate?.[dateStr];
              const dateStatus = occupied.statusByDate?.[dateStr] as string | undefined;
              const isPending = unavailable && dateStatus === "신청중";
              const isRedDay = isRedCalendarDay(dateStr, holidaySet);
              return (
                <button
                  type="button"
                  key={dateStr}
                  onClick={() => handleDayClick(dateStr)}
                  disabled={!clickable}
                  className={`min-h-[44px] rounded-lg flex flex-col items-center justify-center p-1 w-full text-left transition-colors ${
                    isChkIn ? "bg-blue-600 text-white border-2 border-blue-700 font-semibold" :
                    isChkOut ? "bg-sky-600 text-white border-2 border-sky-700 font-semibold" :
                    validOut ? "bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 cursor-pointer" :
                    isPending ? "bg-blue-50 text-blue-700 border border-blue-200 cursor-default" :
                    unavailable ? "bg-rose-50 text-rose-700 border border-rose-200 cursor-default"
                      : "bg-gray-50 text-gray-700 hover:bg-blue-50 hover:border-blue-200 border border-transparent cursor-pointer"
                  }`}
                  title={
                    isChkIn ? "입실일 (클릭 시 변경)" :
                    isChkOut ? "퇴실일" :
                    validOut ? "퇴실일로 선택" :
                    unavailable ? getUnavailableLabel(dateStr, detail) : "입실일로 선택"
                  }
                >
                  <span
                    className={`font-medium ${isChkIn || isChkOut ? "text-white" : ""}`}
                    style={
                      !isChkIn && !isChkOut && isRedDay
                        ? { color: CALENDAR_HOLIDAY_COLOR, fontWeight: 600 }
                        : undefined
                    }
                  >
                    {parseInt(dateStr.slice(8, 10), 10)}
                  </span>
                  {isChkIn && <span className="text-[10px]">입실</span>}
                  {isChkOut && <span className="text-[10px]">퇴실</span>}
                  {unavailable && !validOut && (
                    <span className="text-[10px] truncate w-full text-center">
                      {getUnavailableLabel(dateStr, detail)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
          <p className="text-xs text-gray-400 mt-2">
            입실일을 클릭한 뒤 퇴실일을 클릭하세요. (1박 이상, 이미 예약된 기간과 겹칠 수 없습니다.)
          </p>
        </div>
      </div>

      {/* 선택 후 상세 입력 (날짜 고정) — 모바일 터치·구역 구분 */}
      {checkInDate && checkOutDate && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm max-w-lg mx-auto w-full">
          <h2 className="text-base font-bold text-gray-900 mb-1">예약 상세 입력</h2>
          <p className="text-xs text-gray-500 mb-4">필수 항목을 입력한 뒤 예약하기를 눌러 주세요.</p>
          <form onSubmit={submitApply} className="space-y-5">
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">이용 일정</p>
              <p className="text-[15px] font-semibold text-slate-900 leading-snug">
                입실 {checkInDate.slice(5).replace("-", "/")}({dowLabelKoFromYmd(checkInDate)}) 15:00
              </p>
              <p className="text-[15px] font-semibold text-slate-900 leading-snug">
                퇴실 {checkOutDate.slice(5).replace("-", "/")}({dowLabelKoFromYmd(checkOutDate)}) 11:00
              </p>
              <p className="text-sm text-slate-600 pt-1">
                숙박 <span className="font-bold text-slate-900 tabular-nums">{nightsBetween(checkInDate, checkOutDate)}</span>박
              </p>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2">투숙 정보</p>
              <div>
                <label className="label">이름 (투숙객) *</label>
                <input
                  type="text"
                  autoComplete="name"
                  className="input w-full min-h-[48px]"
                  value={applyGuestName}
                  onChange={(e) => setApplyGuestName(e.target.value)}
                  placeholder="실명 입력"
                  required
                />
              </div>
              <div>
                <label className="label">연락처 *</label>
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  className="input w-full min-h-[48px]"
                  value={applyGuestPhone}
                  onChange={(e) => setApplyGuestPhone(e.target.value)}
                  placeholder="010-0000-0000"
                  required
                />
              </div>
              <div>
                <label className="label">입실 인원 *</label>
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    className="min-h-[48px] min-w-[48px] shrink-0 rounded-xl border border-gray-200 bg-white text-gray-800 font-bold text-lg hover:bg-gray-50 active:bg-gray-100 touch-manipulation"
                    onClick={() => {
                      const n = parseInt(String(applyGuestCount).trim(), 10);
                      const cur = Number.isFinite(n) ? n : 1;
                      setApplyGuestCount(String(Math.max(1, cur - 1)));
                    }}
                    aria-label="인원 줄이기"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    className="input w-full min-h-[48px] text-center font-semibold tabular-nums"
                    value={applyGuestCount}
                    inputMode="numeric"
                    onChange={(e) => setApplyGuestCount(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(String(applyGuestCount).trim(), 10);
                      if (!Number.isFinite(n) || n < 1) setApplyGuestCount("1");
                      else setApplyGuestCount(String(Math.min(99, n)));
                    }}
                    required
                  />
                  <button
                    type="button"
                    className="min-h-[48px] min-w-[48px] shrink-0 rounded-xl border border-gray-200 bg-white text-gray-800 font-bold text-lg hover:bg-gray-50 active:bg-gray-100 touch-manipulation"
                    onClick={() => {
                      const n = parseInt(String(applyGuestCount).trim(), 10);
                      const cur = Number.isFinite(n) ? n : 1;
                      setApplyGuestCount(String(Math.min(99, cur + 1)));
                    }}
                    aria-label="인원 늘리기"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">예약금 이체</p>
              <p className="text-lg font-bold text-amber-950 tabular-nums">
                {(config?.depositAmount ?? 100000).toLocaleString()}원
              </p>
              {config?.depositAccount && (
                <p className="text-sm text-amber-900 leading-relaxed break-words">
                  {config.depositAccount.bankName} {config.depositAccount.accountHolder}{" "}
                  {formatJejuAccountNumber(config.depositAccount.accountNumber)}
                </p>
              )}
              <p className="text-[11px] text-amber-800/90 leading-relaxed">
                예약금은 신청 <span className="font-semibold">당일</span> 이체를 권장합니다. 입금확인 대기 상태가 된
                뒤 <span className="font-semibold">{config?.depositDeadlineDays ?? 5}일</span> 안에 입금이 확인되지
                않으면 예약은 자동으로 취소됩니다.
              </p>
              <JejuRefundPolicyNotice variant="short" className="border-amber-200/80 bg-white/80" />
            </div>

            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2">입금 정보</p>
              <div>
                <label className="label">입금자명 *</label>
                <input
                  type="text"
                  className="input w-full min-h-[48px]"
                  value={applyDepositorName}
                  onChange={(e) => setApplyDepositorName(e.target.value)}
                  placeholder="계좌 이체 시 표시될 이름"
                  required
                />
              </div>
              <div>
                <label className="label">사유 (선택)</label>
                <textarea
                  rows={2}
                  className="input w-full resize-none py-3 min-h-[72px]"
                  placeholder="예: 가족 여행"
                  value={applyReason}
                  onChange={(e) => setApplyReason(e.target.value)}
                />
              </div>
            </div>

            {applyError && (
              <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5">{applyError}</p>
            )}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setCheckOutDate("");
                  setApplyError("");
                }}
                className="min-h-[48px] rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 active:bg-slate-100 touch-manipulation"
              >
                날짜 다시 선택
              </button>
              <button
                type="submit"
                disabled={applySubmitting || yearlyUsage?.canSubmit === false}
                className="min-h-[48px] rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 disabled:opacity-50 touch-manipulation"
              >
                {applySubmitting ? "신청 중…" : yearlyUsage?.canSubmit === false ? "연간 한도 초과" : "예약하기"}
              </button>
            </div>
          </form>
        </div>
      )}

      {welfare && pendingCount > 0 && (
        <p className="text-sm text-gray-600">
          승인 대기 {pendingCount}건이 있습니다.{" "}
          <Link href="/jeju/approve" className="text-blue-600 hover:underline font-medium">승인하기</Link>에서 처리하세요.
        </p>
      )}
    </div>
  );
}

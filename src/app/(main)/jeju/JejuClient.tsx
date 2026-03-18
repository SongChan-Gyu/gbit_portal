"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatJejuAccountNumber } from "@/lib/jeju";
import { todayYMD, addDaysYMD, toYMD } from "@/lib/dateUtils";

type JejuConfig = {
  maxNights: number;
  checkIn: string;
  checkOut: string;
  bookingWindowEnd: string;
  depositAmount?: number;
  depositAccount?: { bankName: string; accountHolder: string; accountNumber: string };
  blockedDates?: string[];
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
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  return { from: toYMD(from), to: toYMD(to) };
}

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
function dowLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return DOW_KO[dt.getDay()] ?? "";
}
function nightsBetween(startYmd: string, endYmd: string): number {
  const [sy, sm, sd] = startYmd.split("-").map((x) => parseInt(x, 10));
  const [ey, em, ed] = endYmd.split("-").map((x) => parseInt(x, 10));
  const s = new Date(sy, (sm ?? 1) - 1, sd ?? 1).getTime();
  const e = new Date(ey, (em ?? 1) - 1, ed ?? 1).getTime();
  const diff = Math.round((e - s) / (24 * 60 * 60 * 1000));
  return Math.max(0, diff);
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

export default function JejuClient({ welfare }: { welfare: boolean }) {
  const router = useRouter();
  const now = new Date();
  const todayYmd = todayYMD();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [occupied, setOccupied] = useState<{
    welfare: boolean;
    byDate?: Record<string, { name: string; empNo: string; requestId: string }[]>;
    occupiedDates?: string[];
    blockedDates?: string[];
  }>({ welfare: false });
  const [allList, setAllList] = useState<ListRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<JejuConfig | null>(null);
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

  const loadOccupied = useCallback(async (y: number, m: number) => {
    const { from, to } = getMonthRange(y, m);
    const res = await fetch(`/api/jeju/occupied-dates?from=${from}&to=${to}`);
    if (res.ok) setOccupied(await res.json());
  }, []);

  const loadAll = useCallback(async () => {
    if (!welfare) return;
    const res = await fetch("/api/jeju/requests");
    if (res.ok) setAllList(await res.json());
  }, [welfare]);

  useEffect(() => {
    fetch("/api/jeju/config").then((r) => { if (r.ok) r.json().then(setConfig); });
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadOccupied(year, month), loadAll()]).finally(() => setLoading(false));
  }, [year, month, loadOccupied, loadAll]);

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); } else setMonth((m) => m + 1);
  };

  const occupiedDates = occupied.occupiedDates ?? [];
  const blockedSet = new Set(occupied.blockedDates ?? []);
  const windowEndYmd = config?.bookingWindowEnd ?? todayYmd;
  const maxNights = config?.maxNights ?? 14;

  const validCheckOutDates = useMemo(() => {
    if (!checkInDate) return [];
    return getValidCheckOutDates(checkInDate, occupiedDates, blockedSet, maxNights);
  }, [checkInDate, occupiedDates, blockedSet, maxNights]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
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

  /** 사용불가일·예약가능기간(2달 후 말일) 초과 → "예약불가" / 그 외 불가(다른 사람 예약) → "예약됨" (과거일도 신청 가능) */
  function getUnavailableLabel(dateStr: string, detail: { name: string; empNo: string; requestId: string }[] | false | undefined) {
    const blockedOrPast = blockedSet.has(dateStr) || dateStr > windowEndYmd;
    if (blockedOrPast) return "예약불가";
    if (Array.isArray(detail) && detail.length > 0) return detail.length > 1 ? `${detail[0].name} 외` : detail[0].name;
    return "예약됨";
  }

  async function submitApply(e: React.FormEvent) {
    e.preventDefault();
    setApplyError("");
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
    loadOccupied(year, month);
    loadAll();
    router.push("/jeju/my?applied=1");
    router.refresh();
  }

  const pendingCount = allList.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      {/* 달력 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronLeft size={20} />
            </button>
            <span className="font-semibold text-gray-800 min-w-[120px] text-center">
              {year}년 {month}월
            </span>
            <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        {config && (
          <p className="text-sm text-gray-700 mb-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            <span className="font-medium">입실 15:00</span> · <span className="font-medium">퇴실 11:00</span> (고정) · 최대 {config.maxNights}박 · 예약 가능 ~{config.bookingWindowEnd}
          </p>
        )}
        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">로딩 중...</div>
        ) : (
          <div className="grid grid-cols-7 gap-1 text-sm">
            {DAYS_KO.map((d) => (
              <div key={d} className="text-center text-gray-500 font-medium py-1">{d}</div>
            ))}
            {calendarDays.map((dateStr, i) => {
              if (!dateStr) return <div key={`e-${i}`} />;
              const unavailable = isDayUnavailable(dateStr);
              const validOut = isDayValidCheckOut(dateStr);
              const isChkIn = dateStr === checkInDate;
              const isChkOut = dateStr === checkOutDate;
              const clickable = !unavailable || validOut;
              const detail = occupied.welfare && occupied.byDate?.[dateStr];
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
                    unavailable
                      ? "bg-rose-50 text-rose-700 border border-rose-200 cursor-default"
                      : "bg-gray-50 text-gray-700 hover:bg-blue-50 hover:border-blue-200 border border-transparent cursor-pointer"
                  }`}
                  title={
                    isChkIn ? "입실일 (클릭 시 변경)" :
                    isChkOut ? "퇴실일" :
                    validOut ? "퇴실일로 선택" :
                    unavailable ? getUnavailableLabel(dateStr, detail) : "입실일로 선택"
                  }
                >
                  <span className="font-medium">{parseInt(dateStr.slice(8, 10), 10)}</span>
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
        <p className="text-xs text-gray-500 mt-2">
          입실일을 클릭한 뒤 퇴실일을 클릭하세요. (1박 이상, 이미 예약된 기간과 겹칠 수 없습니다.)
        </p>
      </div>

      {/* 선택 후 상세 입력 (날짜 고정) */}
      {checkInDate && checkOutDate && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-3">예약 상세 입력</h2>
          <form onSubmit={submitApply} className="space-y-4">
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-700">이용일 (선택 완료)</p>
              <p className="text-base font-bold text-gray-900">
                {checkInDate}({dowLabel(checkInDate)}) 입실 15:00 → {checkOutDate}({dowLabel(checkOutDate)}) 퇴실 11:00
              </p>
              <p className="text-sm text-gray-600 mt-1">
                총 <span className="font-semibold">{nightsBetween(checkInDate, checkOutDate)}</span>박
              </p>
            </div>
            <div>
              <label className="label">이름 *</label>
              <input
                type="text"
                className="input w-full"
                value={applyGuestName}
                onChange={(e) => setApplyGuestName(e.target.value)}
                placeholder="입실자 이름"
                required
              />
            </div>
            <div>
              <label className="label">연락처 *</label>
              <input
                type="tel"
                className="input w-full"
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
                  className="px-4 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 active:bg-gray-100"
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
                  className="input w-full"
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
                  className="px-4 rounded-lg border border-gray-200 bg-white text-gray-700 font-semibold hover:bg-gray-50 active:bg-gray-100"
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
            <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-800">예약금 이체</p>
              <p className="text-base font-bold text-amber-900">
                {(config?.depositAmount ?? 100000).toLocaleString()}원
              </p>
              {config?.depositAccount && (
                <p className="text-sm text-amber-800">
                  {config.depositAccount.bankName} {config.depositAccount.accountHolder}{" "}
                  {formatJejuAccountNumber(config.depositAccount.accountNumber)}
                </p>
              )}
              <p className="text-xs text-amber-700">신청 후 24시간 내 미이체 시 자동 취소될 수 있습니다.</p>
            </div>
            <div>
              <label className="label">입금자명 *</label>
              <input
                type="text"
                className="input w-full"
                value={applyDepositorName}
                onChange={(e) => setApplyDepositorName(e.target.value)}
                placeholder="이체 시 사용할 이름"
                required
              />
            </div>
            <div>
              <label className="label">사유 (선택)</label>
              <input
                type="text"
                className="input w-full"
                placeholder="예: 가족 여행"
                value={applyReason}
                onChange={(e) => setApplyReason(e.target.value)}
              />
            </div>
            {applyError && (
              <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{applyError}</p>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setCheckOutDate("");
                  setApplyError("");
                }}
                className="btn-secondary flex-1"
              >
                퇴실일 다시 선택
              </button>
              <button type="submit" disabled={applySubmitting} className="btn-primary flex-1">
                {applySubmitting ? "신청 중..." : "예약하기"}
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

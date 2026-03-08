"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Calendar as CalIcon, PlusCircle, Check, X, ChevronLeft, ChevronRight, List } from "lucide-react";
import { formatYMD } from "@/lib/dateUtils";
import { formatJejuAccountNumber } from "@/lib/jeju";

const STATUS_KO: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인",
  REJECTED: "반려",
  CANCELLED: "취소",
};
const STATUS_CLS: Record<string, string> = {
  PENDING: "badge-warning",
  APPROVED: "badge-success",
  REJECTED: "badge-danger",
  CANCELLED: "badge-default",
};

type JejuConfig = {
  maxNights: number;
  checkIn: string;
  checkOut: string;
  bookingWindowEnd: string;
  depositAmount?: number;
  depositAccount?: { bankName: string; accountHolder: string; accountNumber: string };
  blockedDates?: string[];
};

type MyRequest = {
  id: string;
  startDate: string;
  endDate: string;
  nights: number;
  reason: string | null;
  guestName?: string;
  guestPhone?: string;
  guestCount?: number;
  status: string;
  rejectComment: string | null;
  createdAt: string;
};

type ListRequest = MyRequest & {
  employeeName: string;
  empNo: string;
  teamName: string | null;
};

function getMonthRange(year: number, month: number) {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function JejuClient({ welfare }: { welfare: boolean }) {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [occupied, setOccupied] = useState<{ welfare: boolean; byDate?: Record<string, { name: string; empNo: string; requestId: string }[]>; occupiedDates?: string[] }>({ welfare: false });
  const [myList, setMyList] = useState<MyRequest[]>([]);
  const [allList, setAllList] = useState<ListRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<JejuConfig | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyStartDate, setApplyStartDate] = useState("");
  const [applyEndDate, setApplyEndDate] = useState("");
  const [applyGuestName, setApplyGuestName] = useState("");
  const [applyGuestPhone, setApplyGuestPhone] = useState("");
  const [applyGuestCount, setApplyGuestCount] = useState(1);
  const [applyDepositorName, setApplyDepositorName] = useState("");
  const [applyReason, setApplyReason] = useState("");
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const loadOccupied = useCallback(async (y: number, m: number) => {
    const { from, to } = getMonthRange(y, m);
    const res = await fetch(`/api/jeju/occupied-dates?from=${from}&to=${to}`);
    if (res.ok) {
      const data = await res.json();
      setOccupied(data);
    }
  }, []);

  const loadMy = useCallback(async () => {
    const res = await fetch("/api/jeju/my");
    if (res.ok) setMyList(await res.json());
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
    Promise.all([loadOccupied(year, month), loadMy(), loadAll()]).finally(() => setLoading(false));
  }, [year, month, loadOccupied, loadMy, loadAll]);

  function prevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const calendarDays: (string | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const s = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    calendarDays.push(s);
  }

  async function submitApply(e: React.FormEvent) {
    e.preventDefault();
    setApplyError("");
    const start = applyStartDate || applyEndDate;
    const end = applyEndDate || applyStartDate;
    if (!start || !end) {
      setApplyError("입실일·퇴실일을 선택해 주세요.");
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
    const count = Number(applyGuestCount);
    if (!Number.isInteger(count) || count < 1) {
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
    setApplyOpen(false);
    setApplyStartDate("");
    setApplyEndDate("");
    setApplyGuestName("");
    setApplyGuestPhone("");
    setApplyGuestCount(1);
    setApplyDepositorName("");
    setApplyReason("");
    loadMy();
    loadOccupied(year, month);
    loadAll();
    router.refresh();
  }

  async function cancelRequest(id: string) {
    if (!confirm("이 숙소 신청을 취소하시겠습니까?")) return;
    const res = await fetch("/api/jeju/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id }),
    });
    if (res.ok) {
      loadMy();
      loadAll();
      loadOccupied(year, month);
      router.refresh();
    }
  }

  async function approveRequest(id: string) {
    const res = await fetch("/api/jeju/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, action: "APPROVE" }),
    });
    if (res.ok) {
      loadAll();
      loadOccupied(year, month);
      router.refresh();
    }
  }

  async function rejectRequest(id: string) {
    if (!rejectComment.trim()) return;
    const res = await fetch("/api/jeju/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, action: "REJECT", comment: rejectComment }),
    });
    if (res.ok) {
      setRejectId(null);
      setRejectComment("");
      loadAll();
      router.refresh();
    }
  }

  const pendingList = allList.filter((r) => r.status === "PENDING");
  const DAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
  const blockedSet = new Set((occupied as { blockedDates?: string[] }).blockedDates ?? []);

  // 선택된 연/월 기준으로 전체 사용 내역 필터링 (이용 기간이 해당 월과 한 번이라도 겹치는 건만)
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const filteredAllList = allList.filter((r) => {
    const s = new Date(r.startDate);
    const e = new Date(r.endDate);
    return e >= monthStart && s <= monthEnd;
  });

  return (
    <div className="space-y-6">
      {/* 캘린더 + 신청 버튼 */}
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
          <button
            type="button"
            onClick={() => setApplyOpen(true)}
            className="btn-primary btn-sm inline-flex items-center gap-1.5"
          >
            <PlusCircle size={16} />
            신청하기
          </button>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-gray-400">로딩 중...</div>
        ) : (
          <div className="grid grid-cols-7 gap-1 text-sm">
            {DAYS_KO.map((d) => (
              <div key={d} className="text-center text-gray-500 font-medium py-1">
                {d}
              </div>
            ))}
            {calendarDays.map((dateStr, i) => {
              if (!dateStr) return <div key={`e-${i}`} />;
              const isBlocked = blockedSet.has(dateStr);
              const isOccupied = occupied.welfare
                ? (occupied.byDate && (occupied.byDate[dateStr]?.length ?? 0) > 0)
                : (occupied.occupiedDates ?? []).includes(dateStr);
              const isUnavailable = isOccupied || isBlocked;
              const detail = occupied.welfare && occupied.byDate?.[dateStr];
              return (
                <div
                  key={dateStr}
                  className={`min-h-[44px] rounded-lg flex flex-col items-center justify-center p-1 ${
                    isUnavailable ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-gray-50 text-gray-700"
                  }`}
                  title={detail ? detail.map((x) => `${x.name}(${x.empNo})`).join(", ") : isBlocked ? "예약 불가" : isOccupied ? "예약됨" : ""}
                >
                  <span className="font-medium">{parseInt(dateStr.slice(8, 10), 10)}</span>
                  {isUnavailable && (
                    <span className="text-[10px] truncate w-full text-center">
                      {isBlocked ? "예약불가" : welfare && detail ? (detail.length > 1 ? `${detail[0].name} 외 ${detail.length - 1}` : detail[0].name) : "예약됨"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">
          {welfare ? "복지부: 빨간 칸에 예약자 이름이 표시됩니다." : "빨간 칸은 이미 예약된 날짜입니다."}
        </p>
      </div>

      {/* 내 신청 목록 */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <CalIcon size={16} /> 내 신청
        </h2>
        {myList.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">신청 내역이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {myList.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {r.startDate === r.endDate ? formatYMD(r.startDate) : `${formatYMD(r.startDate)} ~ ${formatYMD(r.endDate)}`}
                      </span>
                      <span className="text-gray-500 text-sm">· {r.nights}일</span>
                      <span className={`badge shrink-0 ${STATUS_CLS[r.status]}`}>
                        {STATUS_KO[r.status]}
                      </span>
                    </div>
                    {r.reason && (
                      <p className="text-sm text-gray-500">{r.reason}</p>
                    )}
                    {r.status === "REJECTED" && r.rejectComment && (
                      <p className="text-sm text-rose-600">반려 사유: {r.rejectComment}</p>
                    )}
                  </div>
                  {(r.status === "PENDING" || (r.status === "APPROVED" && welfare)) && (
                    <div className="shrink-0 pt-2 sm:pt-0 sm:pl-4 sm:border-l sm:border-gray-200">
                      <button
                        type="button"
                        onClick={() => cancelRequest(r.id)}
                        className="btn-secondary btn-sm text-rose-700 border-rose-200 hover:bg-rose-50 hover:border-rose-300"
                      >
                        취소
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 복지부: 승인 대기 목록 */}
      {welfare && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Check size={16} /> 승인 대기 ({pendingList.length}건)
          </h2>
          {pendingList.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">대기 중인 신청이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {pendingList.map((r) => (
                <li key={r.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800">
                        {r.employeeName}
                        <span className="text-gray-500 text-sm ml-2">{r.empNo}</span>
                        {r.teamName && <span className="text-gray-400 text-xs ml-1">· {r.teamName}</span>}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {r.startDate === r.endDate ? formatYMD(r.startDate) : `${formatYMD(r.startDate)} ~ ${formatYMD(r.endDate)}`} ({r.nights}일)
                      </p>
                      {r.reason && <p className="text-xs text-gray-500 mt-0.5">{r.reason}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0 pl-3 border-l border-gray-200">
                      <button
                        type="button"
                        onClick={() => approveRequest(r.id)}
                        className="btn-primary btn-sm shrink-0"
                      >
                        승인
                      </button>
                      {rejectId === r.id ? (
                        <div className="flex flex-wrap gap-2 items-center">
                          <input
                            type="text"
                            placeholder="반려 사유 입력"
                            value={rejectComment}
                            onChange={(e) => setRejectComment(e.target.value)}
                            className="input text-sm py-1.5 w-40 min-w-0"
                          />
                          <button
                            type="button"
                            onClick={() => rejectRequest(r.id)}
                            disabled={!rejectComment.trim()}
                            className="btn-danger btn-sm disabled:opacity-50 shrink-0"
                          >
                            반려 확정
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRejectId(null); setRejectComment(""); }}
                            className="btn-secondary btn-sm shrink-0"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRejectId(r.id)}
                          className="inline-flex items-center justify-center border border-rose-300 text-rose-700 bg-white hover:bg-rose-50 rounded px-3 py-1.5 text-sm font-medium shrink-0 transition-colors"
                        >
                          반려
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 복지부: 전체 사용 내역 (현재 선택한 연/월 기준) */}
      {welfare && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <List size={16} /> {year}년 {month}월 전체 사용 내역 ({filteredAllList.length}건)
          </h2>
          {filteredAllList.length === 0 ? (
            <p className="text-sm text-gray-500 py-4">이 달의 사용 내역이 없습니다.</p>
          ) : (
            <>
              {/* 데스크톱: 테이블 */}
              <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-100">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600 text-left">
                      <th className="px-3 py-2 font-medium">신청자</th>
                      <th className="px-3 py-2 font-medium">사번</th>
                      <th className="px-3 py-2 font-medium">팀</th>
                      <th className="px-3 py-2 font-medium">이용일</th>
                      <th className="px-3 py-2 font-medium">일수 · 상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAllList.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                        <td className="px-3 py-2 font-medium text-gray-800">{r.employeeName}</td>
                        <td className="px-3 py-2 text-gray-600">{r.empNo}</td>
                        <td className="px-3 py-2 text-gray-500">{r.teamName ?? "-"}</td>
                        <td className="px-3 py-2 text-gray-700">
                          {r.startDate === r.endDate ? formatYMD(r.startDate) : `${formatYMD(r.startDate)} ~ ${formatYMD(r.endDate)}`}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-gray-600">{r.nights}일</span>
                          <span className="ml-2">
                            <span className={`badge ${STATUS_CLS[r.status]}`}>{STATUS_KO[r.status]}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* 모바일: 카드 리스트 — 일수 옆에 상태 */}
              <ul className="md:hidden space-y-2">
                {filteredAllList.map((r) => (
                  <li key={r.id} className="py-2.5 px-3 rounded-lg bg-gray-50 border border-gray-100">
                    <p className="font-medium text-gray-800">{r.employeeName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {r.empNo}
                      {r.teamName ? ` · ${r.teamName}` : ""}
                    </p>
                    <p className="text-sm text-gray-700 mt-1 flex items-center gap-2 flex-wrap">
                      <span>
                        {r.startDate === r.endDate ? formatYMD(r.startDate) : `${formatYMD(r.startDate)} ~ ${formatYMD(r.endDate)}`}
                      </span>
                      <span className="text-gray-600">{r.nights}일</span>
                      <span className={`badge shrink-0 ${STATUS_CLS[r.status]}`}>{STATUS_KO[r.status]}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* 신청 모달 */}
      {applyOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 my-4">
            <h2 className="text-lg font-bold text-gray-800 mb-2">제주도 숙소 신청</h2>
            {config && (
              <p className="text-xs text-gray-600 mb-4">
                입실 15:00 · 퇴실 11:00 (박 단위) · 최대 {config.maxNights}박 · 예약 가능 ~{config.bookingWindowEnd}
              </p>
            )}
            <form onSubmit={submitApply} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">입실일 *</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={applyStartDate}
                    min={new Date().toISOString().slice(0, 10)}
                    max={config?.bookingWindowEnd ?? undefined}
                    onChange={(e) => setApplyStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="label">퇴실일 *</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={applyEndDate}
                    min={applyStartDate || new Date().toISOString().slice(0, 10)}
                    max={config?.bookingWindowEnd ?? undefined}
                    onChange={(e) => setApplyEndDate(e.target.value)}
                    required
                  />
                </div>
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
                <input
                  type="number"
                  min={1}
                  max={99}
                  className="input w-full"
                  value={applyGuestCount}
                  onChange={(e) => setApplyGuestCount(parseInt(e.target.value, 10) || 1)}
                  required
                />
              </div>
              {/* 예약금 10만원 · 이사님 계좌 이체 */}
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
                  placeholder="이체 시 사용할 이름 (예약자가 직접 입력)"
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
              {applyError && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{applyError}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setApplyOpen(false);
                    setApplyError("");
                    setApplyStartDate("");
                    setApplyEndDate("");
                    setApplyGuestName("");
                    setApplyGuestPhone("");
                    setApplyGuestCount(1);
                    setApplyDepositorName("");
                    setApplyReason("");
                  }}
                  className="btn-secondary flex-1"
                >
                  취소
                </button>
                <button type="submit" disabled={applySubmitting} className="btn-primary flex-1">
                  {applySubmitting ? "신청 중..." : "신청"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

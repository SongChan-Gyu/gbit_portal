"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, List, ChevronLeft, ChevronRight } from "lucide-react";
import { formatMDWithDayFromYMD, todayKstYmd } from "@/lib/dateUtils";
import { formatJejuYearStatsSummary, JEJU_YEARLY_HIGH_SUBMISSION_HINT } from "@/lib/jejuYearStats";
import { JejuRefundPolicyNotice } from "@/components/jeju/JejuRefundPolicyNotice";
import { formatJejuDepositAccountLine } from "@/lib/jeju";

type ListRequest = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  nights: number;
  status: string;
  employeeName: string;
  empNo: string;
  teamName: string | null;
  reason: string | null;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  depositorName: string | null;
  /** 달력연도(KST) 기준 — 귀속연도 아님 */
  jejuCalendarYear?: number;
  jejuSubmittedThisYear?: number;
  jejuApprovedStayThisYear?: number;
  jejuHighYearlySubmissions?: boolean;
  step1ApproverId: string | null;
  step1ApproverName: string | null;
  step1ApprovedAt: string | null;
  // 2차 결재 (입금)
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  depositStatus: string;
  depositConfirmedByName: string | null;
  depositConfirmedAt: string | null;
  // 취소/반려
  rejectStep: number | null;
  rejectComment: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelRequestedAt: string | null;
  isPmAdmin: boolean;
  isWelfare: boolean;
  canStep1Approve: boolean;
  canStep2Approve: boolean;
  canCancelStep1Approve: boolean;
  canCancelStep2Approve: boolean;
};

const STATUS_CLS: Record<string, string> = {
  PENDING: "badge-warning",
  STEP1_APPROVED: "badge-info",
  APPROVED: "badge-success",
  REJECTED: "badge-danger",
  CANCELLED: "badge-default",
  CANCEL_REQUESTED: "badge-warning",
  CANCEL_STEP1_APPROVED: "badge-warning",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "복지부 승인 대기",
  STEP1_APPROVED: "입금확인 대기",
  APPROVED: "완료",
  REJECTED: "반려",
  CANCELLED: "취소",
  CANCEL_REQUESTED: "취소 요청 중",
  CANCEL_STEP1_APPROVED: "입금취소 대기",
};

function dateLine(start: string, end: string) {
  return start === end
    ? formatMDWithDayFromYMD(start)
    : `${formatMDWithDayFromYMD(start)} ~ ${formatMDWithDayFromYMD(end)}`;
}

function kstTodayYearMonth(): { year: number; month: number } {
  const t = todayKstYmd();
  return {
    year: parseInt(t.slice(0, 4), 10),
    month: parseInt(t.slice(5, 7), 10),
  };
}

/** YYYY-MM-DD 문자열 기준, 이용 기간이 해당 달과 겹치는지 */
function stayOverlapsCalendarMonth(startYmd: string, endYmd: string, year: number, month: number): boolean {
  const m = String(month).padStart(2, "0");
  const first = `${year}-${m}-01`;
  const lastD = new Date(year, month, 0).getDate();
  const last = `${year}-${m}-${String(lastD).padStart(2, "0")}`;
  return endYmd >= first && startYmd <= last;
}

export default function JejuApproveClient() {
  const router = useRouter();
  const [allList, setAllList] = useState<ListRequest[]>([]);
  const [historyYm, setHistoryYm] = useState(() => kstTodayYearMonth());
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [depositConfirm, setDepositConfirm] = useState<{
    id: string;
    action: "CONFIRM" | "CANCEL_DEPOSIT";
    summary: string;
  } | null>(null);
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositNote, setDepositNote] = useState<{ days: number; line: string | null }>({
    days: 5,
    line: null,
  });

  const loadAll = async () => {
    const res = await fetch("/api/jeju/requests");
    if (res.ok) setAllList(await res.json());
  };

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void fetch("/api/jeju/config")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          c: {
            depositDeadlineDays?: number;
            depositAccount?: { bankName: string; accountHolder: string; accountNumber: string };
          } | null,
        ) => {
          if (!c) return;
          const days = Math.max(1, Number(c.depositDeadlineDays) || 5);
          const acc = c.depositAccount;
          const line =
            acc?.bankName && acc?.accountHolder && acc?.accountNumber
              ? formatJejuDepositAccountLine(acc)
              : null;
          setDepositNote({ days, line });
        },
      );
  }, []);

  async function step1Approve(id: string) {
    const res = await fetch("/api/jeju/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, action: "APPROVE" }),
    });
    if (res.ok) { loadAll(); router.refresh(); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || "처리 실패"); }
  }

  async function step1Reject(id: string) {
    if (!rejectComment.trim()) return;
    const res = await fetch("/api/jeju/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, action: "REJECT", comment: rejectComment }),
    });
    if (res.ok) { setRejectId(null); setRejectComment(""); loadAll(); router.refresh(); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || "처리 실패"); }
  }

  async function depositAction(id: string, action: "CONFIRM" | "CANCEL_DEPOSIT"): Promise<boolean> {
    const res = await fetch("/api/jeju/deposit-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, action }),
    });
    if (res.ok) {
      loadAll();
      router.refresh();
      return true;
    }
    const d = await res.json().catch(() => ({}));
    alert(d.error || "처리 실패");
    return false;
  }

  async function confirmDepositExecute() {
    if (!depositConfirm) return;
    setDepositBusy(true);
    try {
      const ok = await depositAction(depositConfirm.id, depositConfirm.action);
      if (ok) setDepositConfirm(null);
    } finally {
      setDepositBusy(false);
    }
  }

  async function cancelApproveRequest(id: string, action: "APPROVE" | "REJECT") {
    const res = await fetch("/api/jeju/cancel-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, action }),
    });
    if (res.ok) { loadAll(); router.refresh(); }
    else { const d = await res.json().catch(() => ({})); alert(d.error || "처리 실패"); }
  }

  const pendingList = allList.filter((r) => r.status === "PENDING");
  const step2List = allList.filter((r) => r.status === "STEP1_APPROVED");
  const cancelRequestedList = allList.filter((r) => r.status === "CANCEL_REQUESTED");
  const cancelStep2List = allList.filter((r) => r.status === "CANCEL_STEP1_APPROVED");
  const canStep1Approve = allList[0]?.canStep1Approve ?? false;
  const canStep2Approve = allList[0]?.canStep2Approve ?? false;
  const canCancelStep1Approve = allList[0]?.canCancelStep1Approve ?? false;
  const canCancelStep2Approve = allList[0]?.canCancelStep2Approve ?? false;

  const { year: historyYear, month: historyMonth } = historyYm;
  const filteredAllList = allList.filter((r) =>
    stayOverlapsCalendarMonth(r.startDate, r.endDate, historyYear, historyMonth),
  );

  function shiftHistoryMonth(delta: number) {
    setHistoryYm((cur) => {
      let m = cur.month + delta;
      let y = cur.year;
      while (m < 1) {
        m += 12;
        y -= 1;
      }
      while (m > 12) {
        m -= 12;
        y += 1;
      }
      return { year: y, month: m };
    });
  }

  function goHistoryThisMonth() {
    setHistoryYm(kstTodayYearMonth());
  }

  if (loading) {
    return <div className="py-8 text-center text-gray-500">로딩 중...</div>;
  }

  function RequestCard({
    r,
    children,
  }: {
    r: ListRequest;
    children: React.ReactNode;
  }) {
    return (
      <li key={r.id} className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-gray-900 leading-snug">
                {r.employeeName}
                <span className="text-gray-500 font-normal text-sm ml-1.5">{r.empNo}</span>
              </p>
              {r.teamName && <p className="text-xs text-gray-500 mt-0.5">{r.teamName}</p>}
              {r.jejuCalendarYear != null && (
                <p className="text-sm font-bold text-slate-800 mt-1.5 tabular-nums leading-snug">
                  {formatJejuYearStatsSummary(
                    r.jejuCalendarYear,
                    r.jejuSubmittedThisYear ?? 0,
                    r.jejuApprovedStayThisYear ?? 0,
                  )}
                </p>
              )}
              {r.jejuHighYearlySubmissions && (
                <p className="text-sm font-bold text-amber-950 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 mt-1.5 leading-snug">
                  {JEJU_YEARLY_HIGH_SUBMISSION_HINT}
                </p>
              )}
            </div>
            <span className={`badge shrink-0 ${STATUS_CLS[r.status] ?? "badge-default"}`}>
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-800">{dateLine(r.startDate, r.endDate)}</p>
          <p className="text-xs text-gray-500 tabular-nums">{r.nights}박</p>
          <dl className="space-y-1.5 text-sm text-gray-700">
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 shrink-0">투숙객</dt>
              <dd className="text-right min-w-0 break-words">{r.guestName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-gray-500 shrink-0">인원</dt>
              <dd className="tabular-nums">{r.guestCount}명</dd>
            </div>
            {r.depositorName && (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 shrink-0">입금자</dt>
                <dd className="text-right min-w-0 break-words">{r.depositorName}</dd>
              </div>
            )}
            {r.guestPhone && (
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500 shrink-0">연락처</dt>
                <dd className="tabular-nums text-right">{r.guestPhone}</dd>
              </div>
            )}
          </dl>
          {r.reason && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{r.reason}</p>}
          <JejuRefundPolicyNotice
            variant="full"
            className="mt-1"
            depositDeadlineDays={depositNote.days}
            depositAccountSummary={depositNote.line}
          />
        </div>
        {children}
      </li>
    );
  }

  return (
    <div className="space-y-8">
      {/* 복지부 승인 대기 */}
      {canStep1Approve && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Check size={18} className="shrink-0 text-slate-600" /> 복지부 승인 대기
          </h2>
          <p className="text-xs text-gray-500 mb-4">{pendingList.length}건</p>
          {pendingList.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">대기 중인 신청이 없습니다.</p>
          ) : (
            <ul className="space-y-4">
              {pendingList.map((r) => (
                <RequestCard key={r.id} r={r}>
                  {rejectId === r.id ? (
                    <div className="border-t border-gray-100 bg-gray-50/90 p-3 space-y-2">
                      <label className="text-xs font-medium text-gray-600">반려 사유</label>
                      <textarea
                        rows={3}
                        placeholder="반려 사유를 입력하세요"
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                        className="input w-full resize-none py-3 min-h-[80px] text-base"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => { setRejectId(null); setRejectComment(""); }}
                          className="min-h-[48px] rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 touch-manipulation"
                        >
                          닫기
                        </button>
                        <button
                          type="button"
                          onClick={() => step1Reject(r.id)}
                          disabled={!rejectComment.trim()}
                          className="min-h-[48px] rounded-xl border border-rose-300 bg-white text-rose-700 text-sm font-semibold hover:bg-rose-50 disabled:opacity-50 touch-manipulation"
                        >
                          반려 확정
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="border-t border-gray-100 bg-gray-50/90 p-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => step1Approve(r.id)}
                        className="min-h-[48px] rounded-xl border border-slate-800 bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 touch-manipulation"
                      >
                        복지부 승인
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectId(r.id)}
                        className="min-h-[48px] rounded-xl border border-rose-200 bg-white text-rose-700 text-sm font-semibold hover:bg-rose-50 touch-manipulation"
                      >
                        반려
                      </button>
                    </div>
                  )}
                </RequestCard>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 2차 처리 대기 (PM — 입금확인) */}
      {canStep2Approve && step2List.length > 0 && (
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-4 sm:p-5 shadow-sm">
          <h2 className="text-base font-bold text-blue-900 mb-1 flex items-center gap-2">
            <CreditCard size={18} className="shrink-0 text-blue-600" /> 입금확인 대기 (PM)
          </h2>
          <p className="text-xs text-blue-700/80 mb-4">{step2List.length}건</p>
          <ul className="space-y-4">
            {step2List.map((r) => (
              <RequestCard key={r.id} r={r}>
                <div className="border-t border-blue-100 bg-blue-50/40 p-3">
                  <p className="text-xs text-blue-700 mb-3">
                    복지부 승인: {r.step1ApproverName ?? "-"}
                    {r.step1ApprovedAt ? ` (${r.step1ApprovedAt.slice(0, 10)})` : ""}
                  </p>
                  {r.canStep2Approve && (
                    <button
                      type="button"
                      onClick={() =>
                        setDepositConfirm({
                          id: r.id,
                          action: "CONFIRM",
                          summary: `${r.employeeName} · ${r.guestName} · ${dateLine(r.startDate, r.endDate)}`,
                        })
                      }
                      className="w-full min-h-[48px] rounded-xl border border-blue-700 bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 touch-manipulation"
                    >
                      입금확인 완료
                    </button>
                  )}
                  {!r.canStep2Approve && (
                    <p className="text-xs text-blue-600 text-center py-2">PM만 입금확인 가능합니다.</p>
                  )}
                </div>
              </RequestCard>
            ))}
          </ul>
        </div>
      )}

      {/* 취소 — 복지부 승인 대기 */}
      {canCancelStep1Approve && cancelRequestedList.length > 0 && (
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/60 p-4 sm:p-5 shadow-sm">
          <h2 className="text-base font-bold text-amber-950 mb-1">취소 복지부 승인 대기</h2>
          <p className="text-xs text-amber-900/80 mb-4">{cancelRequestedList.length}건</p>
          <ul className="space-y-4">
            {cancelRequestedList.map((r) => (
              <RequestCard key={r.id} r={r}>
                <div className="border-t border-amber-100/80 bg-amber-50/40 p-3 space-y-2">
                  {r.cancelReason && (
                    <p className="text-sm text-amber-900 bg-amber-50/80 rounded-lg px-3 py-2 border border-amber-100">
                      취소 사유: {r.cancelReason}
                    </p>
                  )}
                  {r.depositStatus === "CONFIRMED" && (
                    <p className="text-xs text-amber-700 bg-amber-100/70 rounded px-2 py-1">
                      ※ 입금 확인된 건: 취소 승인 후 PM 입금취소 처리 단계가 필요합니다.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => cancelApproveRequest(r.id, "REJECT")}
                      className="min-h-[48px] rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 touch-manipulation"
                    >
                      취소 반려
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelApproveRequest(r.id, "APPROVE")}
                      className="min-h-[48px] rounded-xl border border-rose-300 bg-white text-rose-800 text-sm font-semibold hover:bg-rose-50 touch-manipulation"
                    >
                      취소 승인
                    </button>
                  </div>
                </div>
              </RequestCard>
            ))}
          </ul>
        </div>
      )}

      {/* 취소 입금취소 대기 (PM — 2차) */}
      {canCancelStep2Approve && cancelStep2List.length > 0 && (
        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4 sm:p-5 shadow-sm">
          <h2 className="text-base font-bold text-rose-900 mb-1 flex items-center gap-2">
            <CreditCard size={18} className="shrink-0 text-rose-600" /> 입금취소 처리 대기 (PM)
          </h2>
          <p className="text-xs text-rose-700/80 mb-4">{cancelStep2List.length}건</p>
          <ul className="space-y-4">
            {cancelStep2List.map((r) => (
              <RequestCard key={r.id} r={r}>
                <div className="border-t border-rose-100 bg-rose-50/40 p-3">
                  <p className="text-xs text-rose-700 mb-3">입금자: {r.depositorName ?? "-"}</p>
                  {r.canCancelStep2Approve && (
                    <button
                      type="button"
                      onClick={() =>
                        setDepositConfirm({
                          id: r.id,
                          action: "CANCEL_DEPOSIT",
                          summary: `${r.employeeName} · ${r.guestName} · ${dateLine(r.startDate, r.endDate)}`,
                        })
                      }
                      className="w-full min-h-[48px] rounded-xl border border-rose-700 bg-rose-700 text-white text-sm font-semibold hover:bg-rose-800 touch-manipulation"
                    >
                      입금취소 처리 완료
                    </button>
                  )}
                  {!r.canCancelStep2Approve && (
                    <p className="text-xs text-rose-600 text-center py-2">PM만 입금취소 처리 가능합니다.</p>
                  )}
                </div>
              </RequestCard>
            ))}
          </ul>
        </div>
      )}

      {/* 전체 신청 내역 (월별 — 이용일이 해당 달과 겹치는 건) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <List size={18} className="shrink-0 text-slate-600" /> 신청 내역 (월별)
          </h2>
          <div className="flex flex-wrap items-center gap-y-2 gap-x-2">
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50/80 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => shiftHistoryMonth(-1)}
                className="p-2 rounded-md hover:bg-white text-gray-600 touch-manipulation"
                aria-label="이전 달"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-semibold text-gray-800 tabular-nums min-w-[5.5rem] text-center px-1">
                {historyYear}년 {historyMonth}월
              </span>
              <button
                type="button"
                onClick={() => shiftHistoryMonth(1)}
                className="p-2 rounded-md hover:bg-white text-gray-600 touch-manipulation"
                aria-label="다음 달"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-initial">
              <select
                className="input h-9 min-h-0 text-sm leading-none py-0 px-2 min-w-[4.25rem] max-w-[40%] sm:max-w-none"
                value={historyYear}
                onChange={(e) => setHistoryYm((h) => ({ ...h, year: Number(e.target.value) }))}
                aria-label="연도"
              >
                {(() => {
                  const cy = kstTodayYearMonth().year;
                  const from = Math.min(2020, cy - 2, historyYear);
                  const to = Math.max(2035, cy + 3, historyYear);
                  return Array.from({ length: to - from + 1 }, (_, i) => from + i).map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ));
                })()}
              </select>
              <select
                className="input h-9 min-h-0 text-sm leading-none py-0 px-2 min-w-[3.25rem] max-w-[32%] sm:max-w-none"
                value={historyMonth}
                onChange={(e) => setHistoryYm((h) => ({ ...h, month: Number(e.target.value) }))}
                aria-label="월"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
                  <option key={mo} value={mo}>
                    {mo}월
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={goHistoryThisMonth}
                className="h-9 shrink-0 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-2.5 text-xs font-medium text-blue-700 hover:bg-blue-100 inline-flex items-center justify-center touch-manipulation"
              >
                이번 달
              </button>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          이용 기간이 위 달과 하루라도 겹치면 표시됩니다. · {filteredAllList.length}건
        </p>
        {filteredAllList.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">선택한 달과 이용일이 겹치는 신청이 없습니다.</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-left">
                    <th className="px-3 py-2 font-medium">신청자</th>
                    <th className="px-3 py-2 font-medium">팀</th>
                    <th className="px-3 py-2 font-bold text-right whitespace-nowrap text-slate-800">
                      올해 기준
                      <br />
                      <span className="font-bold text-[11px] text-slate-600">신청·확정</span>
                    </th>
                    <th className="px-3 py-2 font-medium">이용일</th>
                    <th className="px-3 py-2 font-medium">투숙객 · 인원</th>
                    <th className="px-3 py-2 font-medium">연락처</th>
                    <th className="px-3 py-2 font-medium">입금자</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                    <th className="px-3 py-2 font-medium">입금</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllList.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-medium text-gray-800">
                        {r.employeeName}
                        <span className="text-gray-400 font-normal ml-1 text-xs">{r.empNo}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{r.teamName ?? "-"}</td>
                      <td className="px-3 py-2 text-sm text-right tabular-nums text-slate-800 align-top font-bold">
                        <span>
                          {(r.jejuSubmittedThisYear ?? 0)} / {r.jejuApprovedStayThisYear ?? 0}
                        </span>
                        {r.jejuHighYearlySubmissions && (
                          <span className="block text-xs font-bold text-amber-900 mt-0.5 leading-tight">연간 신청 다수</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap text-xs">
                        {r.startDate} ~ {r.endDate}
                        <span className="text-gray-400 ml-1">{r.nights}박</span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{r.guestName} · {r.guestCount}명</td>
                      <td className="px-3 py-2 text-gray-500 text-xs tabular-nums">{r.guestPhone || "-"}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{r.depositorName ?? "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`badge ${STATUS_CLS[r.status] ?? "badge-default"}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.depositStatus === "CONFIRMED" && <span className="text-green-600 font-medium">확인완료</span>}
                        {r.depositStatus === "CANCELLED" && <span className="text-red-500">취소</span>}
                        {r.depositStatus === "NONE" && <span className="text-gray-400">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden space-y-3">
              {filteredAllList.map((r) => (
                <li key={r.id} className="rounded-2xl border border-gray-100 bg-gray-50/80 overflow-hidden">
                  <div className="p-3.5 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{r.employeeName}
                          <span className="text-gray-400 font-normal text-xs ml-1">{r.empNo}</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{r.teamName ?? ""}</p>
                        {r.jejuCalendarYear != null && (
                          <p className="text-sm font-bold text-slate-800 mt-1 tabular-nums leading-snug">
                            {formatJejuYearStatsSummary(
                              r.jejuCalendarYear,
                              r.jejuSubmittedThisYear ?? 0,
                              r.jejuApprovedStayThisYear ?? 0,
                            )}
                          </p>
                        )}
                        {r.jejuHighYearlySubmissions && (
                          <p className="text-sm font-bold text-amber-950 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 mt-1 leading-snug">
                            {JEJU_YEARLY_HIGH_SUBMISSION_HINT}
                          </p>
                        )}
                      </div>
                      <span className={`badge shrink-0 ${STATUS_CLS[r.status] ?? "badge-default"}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">{dateLine(r.startDate, r.endDate)}</p>
                    <p className="text-xs text-gray-600">
                      {r.nights}박 · {r.guestCount}명 · {r.guestName}
                      {r.guestPhone ? ` · ${r.guestPhone}` : ""}
                      {r.depositorName ? ` · 입금 ${r.depositorName}` : ""}
                    </p>
                    {r.depositStatus === "CONFIRMED" && (
                      <p className="text-xs text-green-600">입금확인 완료</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {depositConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-5 space-y-4">
            <h3 className="text-base font-bold text-gray-900">
              {depositConfirm.action === "CONFIRM" ? "입금확인 완료" : "입금취소 처리 완료"}
            </h3>
            <p className="text-sm text-gray-600">
              {depositConfirm.action === "CONFIRM"
                ? "입금 확인을 완료하면 예약이 최종 승인 처리됩니다. 계속하시겠습니까?"
                : "입금취소 처리를 완료하면 해당 건의 입금 상태가 취소로 반영됩니다. 계속하시겠습니까?"}
            </p>
            <p className="text-sm font-medium text-slate-800 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
              {depositConfirm.summary}
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={depositBusy}
                onClick={() => setDepositConfirm(null)}
                className="min-h-[48px] rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                닫기
              </button>
              <button
                type="button"
                disabled={depositBusy}
                onClick={() => void confirmDepositExecute()}
                className={`min-h-[48px] rounded-xl text-white text-sm font-semibold disabled:opacity-50 ${
                  depositConfirm.action === "CONFIRM"
                    ? "border border-blue-800 bg-blue-800 hover:bg-blue-900"
                    : "border border-rose-800 bg-rose-800 hover:bg-rose-900"
                }`}
              >
                {depositBusy ? "처리 중…" : "확인 후 처리"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

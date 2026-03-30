"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, List } from "lucide-react";
import { formatMDWithDayFromYMD } from "@/lib/dateUtils";

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
  guestName: string;
  guestPhone: string;
  guestCount: number;
  depositorName: string | null;
  cancelRequestedAt: string | null;
  cancelReason: string | null;
};

const STATUS_CLS: Record<string, string> = {
  PENDING: "badge-warning",
  APPROVED: "badge-success",
  REJECTED: "badge-danger",
  CANCELLED: "badge-default",
  CANCEL_REQUESTED: "badge-warning",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인",
  REJECTED: "반려",
  CANCELLED: "취소",
  CANCEL_REQUESTED: "취소 요청 중",
};

function dateLine(start: string, end: string) {
  return start === end
    ? formatMDWithDayFromYMD(start)
    : `${formatMDWithDayFromYMD(start)} ~ ${formatMDWithDayFromYMD(end)}`;
}

export default function JejuApproveClient() {
  const router = useRouter();
  const [allList, setAllList] = useState<ListRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  async function cancelApproveRequest(id: string, action: "APPROVE" | "REJECT") {
    const res = await fetch("/api/jeju/cancel-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, action }),
    });
    if (res.ok) {
      loadAll();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "처리에 실패했습니다.");
    }
  }

  const loadAll = async () => {
    const res = await fetch("/api/jeju/requests");
    if (res.ok) setAllList(await res.json());
  };

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, []);

  async function approveRequest(id: string) {
    const res = await fetch("/api/jeju/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, action: "APPROVE" }),
    });
    if (res.ok) {
      loadAll();
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
  const cancelRequestedList = allList.filter((r) => r.status === "CANCEL_REQUESTED");
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const filteredAllList = allList.filter((r) => {
    const s = new Date(r.startDate);
    const e = new Date(r.endDate);
    return e >= monthStart && s <= monthEnd;
  });

  if (loading) {
    return <div className="py-8 text-center text-gray-500">로딩 중...</div>;
  }

  return (
    <div className="space-y-8">
      {/* 승인 대기 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
          <Check size={18} className="shrink-0 text-slate-600" /> 승인 대기
        </h2>
        <p className="text-xs text-gray-500 mb-4">{pendingList.length}건</p>
        {pendingList.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">대기 중인 신청이 없습니다.</p>
        ) : (
          <ul className="space-y-4">
            {pendingList.map((r) => (
              <li key={r.id} className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                <div className="p-4 space-y-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-gray-900 leading-snug">
                      {r.employeeName}
                      <span className="text-gray-500 font-normal text-sm ml-1.5">{r.empNo}</span>
                    </p>
                    {r.teamName && <p className="text-xs text-gray-500 mt-0.5">{r.teamName}</p>}
                    <p className="text-sm font-semibold text-slate-800 mt-2">{dateLine(r.startDate, r.endDate)}</p>
                    <p className="text-xs text-gray-500 tabular-nums">{r.nights}박</p>
                  </div>
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
                </div>
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
                        onClick={() => {
                          setRejectId(null);
                          setRejectComment("");
                        }}
                        className="min-h-[48px] rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 touch-manipulation"
                      >
                        닫기
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectRequest(r.id)}
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
                      onClick={() => approveRequest(r.id)}
                      className="min-h-[48px] rounded-xl border border-slate-800 bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 touch-manipulation"
                    >
                      승인
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
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 취소 승인 대기 */}
      {cancelRequestedList.length > 0 && (
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/60 p-4 sm:p-5 shadow-sm">
          <h2 className="text-base font-bold text-amber-950 mb-1">취소 승인 대기</h2>
          <p className="text-xs text-amber-900/80 mb-4">{cancelRequestedList.length}건</p>
          <ul className="space-y-4">
            {cancelRequestedList.map((r) => (
              <li key={r.id} className="rounded-2xl border border-amber-100 bg-white overflow-hidden shadow-sm">
                <div className="p-4 space-y-2">
                  <p className="text-[15px] font-bold text-gray-900">
                    {r.employeeName}
                    <span className="text-gray-500 font-normal text-sm ml-1.5">{r.empNo}</span>
                  </p>
                  {r.teamName && <p className="text-xs text-gray-500">{r.teamName}</p>}
                  <p className="text-sm font-semibold text-slate-800 pt-1">{dateLine(r.startDate, r.endDate)}</p>
                  <p className="text-xs text-gray-500 tabular-nums">{r.nights}박 · 투숙객 {r.guestName} · {r.guestCount}명</p>
                  {r.depositorName && <p className="text-xs text-gray-600">입금자 {r.depositorName}</p>}
                  {r.cancelReason && (
                    <p className="text-sm text-amber-900 bg-amber-50/80 rounded-lg px-3 py-2 border border-amber-100 mt-2">
                      취소 사유: {r.cancelReason}
                    </p>
                  )}
                </div>
                <div className="border-t border-amber-100/80 bg-amber-50/40 p-3 grid grid-cols-2 gap-2">
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
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 전체 신청 내역 (이번 달) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
          <List size={18} className="shrink-0 text-slate-600" /> {year}년 {month}월 신청 내역
        </h2>
        <p className="text-xs text-gray-500 mb-4">{filteredAllList.length}건</p>
        {filteredAllList.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">이 달의 신청이 없습니다.</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 text-left">
                    <th className="px-3 py-2 font-medium">신청자</th>
                    <th className="px-3 py-2 font-medium">사번</th>
                    <th className="px-3 py-2 font-medium">팀</th>
                    <th className="px-3 py-2 font-medium">이용일</th>
                    <th className="px-3 py-2 font-medium">인원</th>
                    <th className="px-3 py-2 font-medium">투숙객 · 입금자</th>
                    <th className="px-3 py-2 font-medium">일수 · 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllList.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-medium text-gray-800">{r.employeeName}</td>
                      <td className="px-3 py-2 text-gray-600">{r.empNo}</td>
                      <td className="px-3 py-2 text-gray-500">{r.teamName ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{r.guestCount}명</td>
                      <td className="px-3 py-2 text-gray-600 text-xs">
                        {r.guestName}{r.depositorName ? ` · ${r.depositorName}` : ""}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-gray-600">{r.nights}박</span>
                        <span className="ml-2">
                          <span className={`badge ${STATUS_CLS[r.status] ?? "badge-default"}`}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </span>
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
                        <p className="font-semibold text-gray-900">{r.employeeName}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {r.empNo}
                          {r.teamName ? ` · ${r.teamName}` : ""}
                        </p>
                      </div>
                      <span className={`badge shrink-0 ${STATUS_CLS[r.status] ?? "badge-default"}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">{dateLine(r.startDate, r.endDate)}</p>
                    <p className="text-xs text-gray-600">
                      {r.nights}박 · {r.guestCount}명 · {r.guestName}
                      {r.depositorName ? ` · 입금 ${r.depositorName}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

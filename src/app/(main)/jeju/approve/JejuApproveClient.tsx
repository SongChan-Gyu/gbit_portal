"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, List } from "lucide-react";

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
                      {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`} ({r.nights}박)
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      투숙객 {r.guestName} · 인원 {r.guestCount}명
                      {r.depositorName ? ` · 입금자 ${r.depositorName}` : ""}
                      {r.guestPhone ? ` · ${r.guestPhone}` : ""}
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
                        className="btn-ghost text-rose-600 hover:bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5 text-sm"
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

      {/* 취소 승인 대기 */}
      {cancelRequestedList.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <h2 className="font-semibold text-amber-800 mb-3">취소 승인 대기 ({cancelRequestedList.length}건)</h2>
          <ul className="space-y-3">
            {cancelRequestedList.map((r) => (
              <li key={r.id} className="border border-amber-100 rounded-lg p-3 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800">
                      {r.employeeName}
                      <span className="text-gray-500 text-sm ml-2">{r.empNo}</span>
                      {r.teamName && <span className="text-gray-400 text-xs ml-1">· {r.teamName}</span>}
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`} ({r.nights}박)
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      투숙객 {r.guestName} · 인원 {r.guestCount}명
                      {r.depositorName ? ` · 입금자 ${r.depositorName}` : ""}
                    </p>
                    {r.cancelReason && <p className="text-xs text-amber-700 mt-0.5">취소 사유: {r.cancelReason}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => cancelApproveRequest(r.id, "REJECT")}
                      className="btn-secondary btn-sm"
                    >
                      취소 반려
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelApproveRequest(r.id, "APPROVE")}
                      className="btn-danger btn-sm"
                    >
                      취소 승인
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 전체 신청 내역 (이번 달) */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <List size={16} /> {year}년 {month}월 신청 내역 ({filteredAllList.length}건)
        </h2>
        {filteredAllList.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">이 달의 신청이 없습니다.</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-100">
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
                      <td className="px-3 py-2 text-gray-700">
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
                            {r.status === "PENDING" ? "승인 대기" : r.status === "APPROVED" ? "승인" : r.status === "REJECTED" ? "반려" : r.status === "CANCEL_REQUESTED" ? "취소 요청 중" : "취소"}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden space-y-2">
              {filteredAllList.map((r) => (
                <li key={r.id} className="py-2.5 px-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="font-medium text-gray-800">{r.employeeName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.empNo}{r.teamName ? ` · ${r.teamName}` : ""}</p>
                  <p className="text-xs text-gray-600 mt-0.5">투숙객 {r.guestName} · {r.guestCount}명{r.depositorName ? ` · 입금자 ${r.depositorName}` : ""}</p>
                  <p className="text-sm text-gray-700 mt-1 flex items-center gap-2 flex-wrap">
                    <span>{r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`}</span>
                    <span className="text-gray-600">{r.nights}박</span>
                    <span className={`badge shrink-0 ${STATUS_CLS[r.status] ?? "badge-default"}`}>
                      {r.status === "PENDING" ? "승인 대기" : r.status === "APPROVED" ? "승인" : r.status === "REJECTED" ? "반려" : r.status === "CANCEL_REQUESTED" ? "취소 요청 중" : "취소"}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

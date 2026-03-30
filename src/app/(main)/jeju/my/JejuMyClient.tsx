"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { formatMDWithDayFromYMD } from "@/lib/dateUtils";

const STATUS_KO: Record<string, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인",
  REJECTED: "반려",
  CANCELLED: "취소",
  CANCEL_REQUESTED: "취소 요청 중",
};
const STATUS_CLS: Record<string, string> = {
  PENDING: "badge-warning",
  APPROVED: "badge-success",
  REJECTED: "badge-danger",
  CANCELLED: "badge-default",
  CANCEL_REQUESTED: "badge-warning",
};

type MyRequest = {
  id: string;
  startDate: string;
  endDate: string;
  nights: number;
  reason: string | null;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  depositorName: string | null;
  applicantName: string;
  status: string;
  rejectComment: string | null;
  cancelRequestedAt: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export default function JejuMyClient() {
  const router = useRouter();
  const [list, setList] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});

  const load = async () => {
    const res = await fetch("/api/jeju/my");
    if (res.ok) setList(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  async function cancelRequest(id: string, isApproved: boolean) {
    if (isApproved && !confirm("승인된 예약을 취소 요청하시겠습니까? (복지부 승인 후 취소됩니다)")) return;
    if (!isApproved && !confirm("이 숙소 신청을 취소하시겠습니까?")) return;
    const res = await fetch("/api/jeju/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, reason: cancelReasons[id]?.trim() || undefined }),
    });
    if (res.ok) {
      setCancelReasons((prev) => ({ ...prev, [id]: "" }));
      load();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "취소 처리에 실패했습니다.");
    }
  }

  async function submitEdit(e: React.FormEvent<HTMLFormElement>, requestId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const reasonEl = form.querySelector('[name="reason"]') as HTMLInputElement | HTMLTextAreaElement | null;
    const payload = {
      requestId,
      startDate: (form.querySelector('[name="startDate"]') as HTMLInputElement)?.value,
      endDate: (form.querySelector('[name="endDate"]') as HTMLInputElement)?.value,
      reason: reasonEl?.value?.trim() || undefined,
      guestName: (form.querySelector('[name="guestName"]') as HTMLInputElement)?.value?.trim(),
      guestPhone: (form.querySelector('[name="guestPhone"]') as HTMLInputElement)?.value?.trim(),
      guestCount: parseInt((form.querySelector('[name="guestCount"]') as HTMLInputElement)?.value || "1", 10),
      depositorName: (form.querySelector('[name="depositorName"]') as HTMLInputElement)?.value?.trim() || undefined,
    };
    const res = await fetch("/api/jeju/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setEditId(null);
      load();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "수정에 실패했습니다.");
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-gray-500">로딩 중...</div>;
  }

  const dateLine = (start: string, end: string) =>
    start === end
      ? formatMDWithDayFromYMD(start)
      : `${formatMDWithDayFromYMD(start)} ~ ${formatMDWithDayFromYMD(end)}`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
      <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
        <CalendarDays size={18} className="shrink-0 text-slate-600" /> 예약 신청 내역
      </h2>
      <p className="text-xs text-gray-500 mb-4">승인 전에는 수정·취소가 가능합니다.</p>
      {list.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">신청 내역이 없습니다.</p>
      ) : (
        <ul className="space-y-4">
          {list.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm"
            >
              {editId === r.id && r.status === "PENDING" ? (
                <form onSubmit={(e) => submitEdit(e, r.id)} className="p-4 space-y-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">예약 수정</p>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="label">이용 시작일</label>
                      <input
                        name="startDate"
                        type="date"
                        defaultValue={r.startDate}
                        className="input w-full min-h-[48px]"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">이용 종료일</label>
                      <input
                        name="endDate"
                        type="date"
                        defaultValue={r.endDate}
                        className="input w-full min-h-[48px]"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">사유 (선택)</label>
                    <textarea
                      name="reason"
                      rows={2}
                      defaultValue={r.reason ?? ""}
                      className="input w-full resize-none py-3 min-h-[72px]"
                      placeholder="선택"
                    />
                  </div>
                  <div>
                    <label className="label">투숙객명 *</label>
                    <input name="guestName" type="text" defaultValue={r.guestName} className="input w-full min-h-[48px]" required />
                  </div>
                  <div>
                    <label className="label">연락처 *</label>
                    <input name="guestPhone" type="tel" inputMode="tel" defaultValue={r.guestPhone} className="input w-full min-h-[48px]" required />
                  </div>
                  <div>
                    <label className="label">인원 수 *</label>
                    <input
                      name="guestCount"
                      type="number"
                      min={1}
                      defaultValue={r.guestCount}
                      className="input w-full min-h-[48px] tabular-nums"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">입금자명</label>
                    <input name="depositorName" type="text" defaultValue={r.depositorName ?? ""} className="input w-full min-h-[48px]" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button type="button" onClick={() => setEditId(null)} className="min-h-[48px] rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 touch-manipulation">
                      닫기
                    </button>
                    <button type="submit" className="min-h-[48px] rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 touch-manipulation">
                      저장
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="p-4 pb-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[15px] font-bold text-gray-900 leading-snug">{dateLine(r.startDate, r.endDate)}</p>
                        <p className="text-sm text-gray-500 mt-0.5 tabular-nums">{r.nights}박</p>
                      </div>
                      <span className={`badge shrink-0 ${STATUS_CLS[r.status] ?? "badge-default"}`}>
                        {STATUS_KO[r.status] ?? r.status}
                      </span>
                    </div>
                    <dl className="space-y-2 text-sm text-gray-700">
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500 shrink-0">신청자</dt>
                        <dd className="font-medium text-right min-w-0 break-words">{r.applicantName}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500 shrink-0">투숙객</dt>
                        <dd className="text-right min-w-0 break-words">{r.guestName}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-gray-500 shrink-0">인원</dt>
                        <dd className="tabular-nums">{r.guestCount}명</dd>
                      </div>
                      {r.guestPhone && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-gray-500 shrink-0">연락처</dt>
                          <dd className="tabular-nums text-right">{r.guestPhone}</dd>
                        </div>
                      )}
                      {r.depositorName && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-gray-500 shrink-0">입금자</dt>
                          <dd className="text-right min-w-0 break-words">{r.depositorName}</dd>
                        </div>
                      )}
                    </dl>
                    {r.reason && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">{r.reason}</p>}
                    {r.status === "REJECTED" && r.rejectComment && (
                      <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">반려 사유: {r.rejectComment}</p>
                    )}
                    {r.status === "CANCEL_REQUESTED" && (
                      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        취소 요청이 접수되었습니다. 복지부 승인 후 취소됩니다.
                      </p>
                    )}
                  </div>
                  {r.status === "PENDING" && (
                    <div className="border-t border-gray-100 bg-gray-50/90 p-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditId(r.id)}
                        className="min-h-[44px] rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-white touch-manipulation"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelRequest(r.id, false)}
                        className="min-h-[44px] rounded-xl border border-rose-200 bg-white text-rose-700 text-sm font-medium hover:bg-rose-50 touch-manipulation"
                      >
                        취소
                      </button>
                    </div>
                  )}
                  {r.status === "APPROVED" && (
                    <div className="border-t border-gray-100 bg-gray-50/90 p-3 space-y-2">
                      <label className="text-xs font-medium text-gray-600">취소 사유 (선택)</label>
                      <input
                        type="text"
                        placeholder="필요 시 입력"
                        value={cancelReasons[r.id] ?? ""}
                        onChange={(e) => setCancelReasons((prev) => ({ ...prev, [r.id]: e.target.value }))}
                        className="input w-full min-h-[48px] text-base"
                      />
                      <button
                        type="button"
                        onClick={() => cancelRequest(r.id, true)}
                        className="w-full min-h-[48px] rounded-xl border border-rose-200 bg-white text-rose-700 text-sm font-semibold hover:bg-rose-50 touch-manipulation"
                      >
                        취소 요청
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

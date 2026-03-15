"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { formatYMD } from "@/lib/dateUtils";

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
    const payload = {
      requestId,
      startDate: (form.querySelector('[name="startDate"]') as HTMLInputElement)?.value,
      endDate: (form.querySelector('[name="endDate"]') as HTMLInputElement)?.value,
      reason: (form.querySelector('[name="reason"]') as HTMLInputElement)?.value?.trim() || undefined,
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <CalendarDays size={16} /> 예약 신청 내역
      </h2>
      {list.length === 0 ? (
        <p className="text-sm text-gray-500 py-4">신청 내역이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              {editId === r.id && r.status === "PENDING" ? (
                <form onSubmit={(e) => submitEdit(e, r.id)} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">이용 시작일</label>
                      <input name="startDate" type="date" defaultValue={r.startDate} className="input text-sm w-full" required />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">이용 종료일</label>
                      <input name="endDate" type="date" defaultValue={r.endDate} className="input text-sm w-full" required />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">사유</label>
                    <input name="reason" type="text" defaultValue={r.reason ?? ""} className="input text-sm w-full" placeholder="선택" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">투숙객명 *</label>
                    <input name="guestName" type="text" defaultValue={r.guestName} className="input text-sm w-full" required />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">연락처 *</label>
                    <input name="guestPhone" type="text" defaultValue={r.guestPhone} className="input text-sm w-full" required />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">인원 수 *</label>
                    <input name="guestCount" type="number" min={1} defaultValue={r.guestCount} className="input text-sm w-full" required />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">입금자명</label>
                    <input name="depositorName" type="text" defaultValue={r.depositorName ?? ""} className="input text-sm w-full" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="btn-primary btn-sm">저장</button>
                    <button type="button" onClick={() => setEditId(null)} className="btn-secondary btn-sm">취소</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {r.startDate === r.endDate ? formatYMD(r.startDate) : `${formatYMD(r.startDate)} ~ ${formatYMD(r.endDate)}`}
                        </span>
                        <span className="text-gray-500 text-sm">· {r.nights}박</span>
                        <span className={`badge shrink-0 ${STATUS_CLS[r.status] ?? "badge-default"}`}>
                          {STATUS_KO[r.status] ?? r.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 grid grid-cols-1 xs:grid-cols-2 gap-x-4 gap-y-0.5">
                        <span>신청자: {r.applicantName}</span>
                        <span>인원: {r.guestCount}명</span>
                        {r.depositorName && <span>입금자: {r.depositorName}</span>}
                        <span>투숙객: {r.guestName}</span>
                        {r.guestPhone && <span>연락처: {r.guestPhone}</span>}
                      </div>
                      {r.reason && <p className="text-sm text-gray-500">{r.reason}</p>}
                      {r.status === "REJECTED" && r.rejectComment && (
                        <p className="text-sm text-rose-600">반려 사유: {r.rejectComment}</p>
                      )}
                      {r.status === "CANCEL_REQUESTED" && (
                        <p className="text-sm text-amber-700">취소 요청이 접수되었습니다. 복지부 승인 후 취소됩니다.</p>
                      )}
                    </div>
                    <div className="shrink-0 pt-2 sm:pt-0 sm:pl-4 sm:border-l sm:border-gray-200 flex flex-wrap items-center gap-2">
                      {r.status === "PENDING" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditId(r.id)}
                            className="btn-secondary btn-sm"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelRequest(r.id, false)}
                            className="btn-secondary btn-sm text-rose-700 border-rose-200 hover:bg-rose-50"
                          >
                            취소
                          </button>
                        </>
                      )}
                      {r.status === "APPROVED" && (
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="text"
                            placeholder="취소 사유 (선택)"
                            value={cancelReasons[r.id] ?? ""}
                            onChange={(e) => setCancelReasons((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            className="input text-sm py-1.5 w-36 min-w-0"
                          />
                          <button
                            type="button"
                            onClick={() => cancelRequest(r.id, true)}
                            className="btn-secondary btn-sm text-rose-700 border-rose-200 hover:bg-rose-50"
                          >
                            취소 요청
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

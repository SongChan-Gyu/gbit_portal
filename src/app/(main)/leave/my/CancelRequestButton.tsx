"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";

export default function CancelRequestButton({ requestId, className }: { requestId: string; className?: string }) {
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState("");

  async function submit() {
    if (!reason.trim()) { setErr("취소 사유를 입력해주세요."); return; }
    setLoading(true); setErr("");
    const res = await fetch(`/api/leave/request/${requestId}/cancel-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setErr(data.error ?? "실패"); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-1 text-xs text-orange-600 hover:text-orange-800 px-2 py-1 rounded border border-orange-200 hover:bg-orange-50 transition ${className ?? ""}`}
      >
        <XCircle size={11} /> 취소신청
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <h3 className="font-bold text-gray-800 mb-1">휴가 취소 신청</h3>
            <p className="text-xs text-gray-500 mb-4">
              승인된 휴가를 취소하려면 결재자 승인이 필요합니다.
            </p>
            <label className="label">취소 사유 <span className="text-red-500">*</span></label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="취소 사유를 입력하세요"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1 text-sm">닫기</button>
              <button onClick={submit} disabled={loading} className="btn-primary flex-1 text-sm bg-orange-500 hover:bg-orange-600 border-orange-500">
                {loading ? "신청 중..." : "취소 신청"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

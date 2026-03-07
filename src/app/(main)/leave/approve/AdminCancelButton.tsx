"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";

export default function AdminCancelButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleCancel() {
    if (!confirm("이 휴가를 관리자 직권으로 취소합니다. 할당(연차 등)이 복원됩니다. 계속하시겠습니까?")) return;
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/leave/request/${requestId}/admin-cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "취소 처리에 실패했습니다.");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setErr("요청 중 오류가 발생했습니다.");
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={handleCancel}
        disabled={loading}
        className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
      >
        <XCircle size={11} /> {loading ? "처리 중..." : "관리자 취소"}
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}

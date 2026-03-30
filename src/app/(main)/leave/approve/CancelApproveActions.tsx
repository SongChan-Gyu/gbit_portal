"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

export default function CancelApproveActions({
  requestId,
  impersonateId,
}: {
  requestId: string;
  impersonateId?: string;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState<"approve"|"reject"|null>(null);
  const [err, setErr] = useState("");

  async function handle(action: "APPROVE"|"REJECT") {
    setLoading(action === "APPROVE" ? "approve" : "reject");
    setErr("");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (impersonateId) headers["x-impersonate"] = impersonateId;
    const res = await fetch("/api/leave/cancel-approve", {
      method: "POST",
      headers,
      body: JSON.stringify({ requestId, action, comment }),
    });
    const data = await res.json();
    setLoading(null);
    if (!res.ok) { setErr(data.error ?? "처리 실패"); return; }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600">의견 입력</label>
      <textarea
        className="input text-sm resize-none"
        rows={3}
        placeholder="취소 승인·반려 시 메모 (선택)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handle("APPROVE")}
          disabled={!!loading}
          className="flex-1 inline-flex items-center justify-center gap-1 py-2 px-2.5 text-xs font-medium rounded-lg border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 transition"
        >
          <Check size={14} strokeWidth={2} />
          {loading === "approve" ? "처리 중..." : "취소 승인"}
        </button>
        <button
          type="button"
          onClick={() => handle("REJECT")}
          disabled={!!loading}
          className="flex-1 inline-flex items-center justify-center gap-1 py-2 px-2.5 text-xs font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
        >
          <X size={14} strokeWidth={2} />
          {loading === "reject" ? "처리 중..." : "취소 반려"}
        </button>
      </div>
    </div>
  );
}

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
      <input
        className="input text-sm"
        placeholder="코멘트 (선택)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => handle("APPROVE")}
          disabled={!!loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition"
        >
          <Check size={14} />
          {loading === "approve" ? "처리 중..." : "취소 승인"}
        </button>
        <button
          onClick={() => handle("REJECT")}
          disabled={!!loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition"
        >
          <X size={14} />
          {loading === "reject" ? "처리 중..." : "취소 반려"}
        </button>
      </div>
    </div>
  );
}

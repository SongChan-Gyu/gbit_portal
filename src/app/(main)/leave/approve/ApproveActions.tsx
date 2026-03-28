"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

export default function ApproveActions({
  approvalId, impersonateId,
}: { approvalId: string; impersonateId?: string }) {
  const [comment, setComment]   = useState("");
  const [loading, setLoading]   = useState<"approve" | "reject" | null>(null);
  const [error, setError]       = useState("");
  const router = useRouter();

  async function handle(action: "APPROVE" | "REJECT") {
    if (action === "REJECT" && !comment.trim()) { setError("반려 사유를 입력하세요."); return; }
    setLoading(action === "APPROVE" ? "approve" : "reject");
    setError("");
    const headers: Record<string,string> = { "Content-Type":"application/json" };
    if (impersonateId) headers["x-impersonate"] = impersonateId;
    const res = await fetch("/api/leave/approve", {
      method: "POST", headers,
      body: JSON.stringify({ approvalId, action, comment }),
    });
    const data = await res.json();
    setLoading(null);
    if (!res.ok) { setError(data.error ?? "처리 실패"); return; }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600">의견 입력</label>
      <textarea className="input resize-none text-[13px]" rows={3}
        placeholder="반려 시 사유를 입력하세요."
        value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => handle("APPROVE")} disabled={!!loading}
          className="btn-primary btn-sm flex-1 gap-1">
          <CheckCircle2 size={13} />
          {loading === "approve" ? "처리중…" : "승인"}
        </button>
        <button onClick={() => handle("REJECT")} disabled={!!loading}
          className="btn-danger btn-sm flex-1 gap-1">
          <XCircle size={13} />
          {loading === "reject" ? "처리중…" : "반려"}
        </button>
      </div>
    </div>
  );
}

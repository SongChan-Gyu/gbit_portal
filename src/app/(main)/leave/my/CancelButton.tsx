"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton({ requestId, className }: { requestId: string; className?: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function cancel() {
    if (!confirm("승인 전 신청을 철회합니다. 계속할까요?")) return;
    setLoading(true);
    await fetch(`/api/leave/request/${requestId}/cancel`, { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button onClick={cancel} disabled={loading}
      className={`btn-ghost btn-sm text-red-500 hover:bg-red-50 hover:text-red-600 ${className ?? ""}`}>
      {loading ? "철회 중…" : "철회"}
    </button>
  );
}

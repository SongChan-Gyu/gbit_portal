"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton({ requestId }: { requestId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function cancel() {
    if (!confirm("이 휴가 신청을 취소하시겠습니까?")) return;
    setLoading(true);
    await fetch(`/api/leave/request/${requestId}/cancel`, { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button onClick={cancel} disabled={loading}
      className="btn-ghost btn-sm text-red-500 hover:bg-red-50 hover:text-red-600">
      {loading ? "취소중…" : "취소"}
    </button>
  );
}

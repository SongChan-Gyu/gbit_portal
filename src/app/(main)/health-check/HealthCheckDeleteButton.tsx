"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  submissionId: string;
  confirmMessage?: string;
  className?: string;
  label?: string;
  onDeleted?: () => void;
};

export default function HealthCheckDeleteButton({
  submissionId,
  confirmMessage = "이 신청 내역을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.",
  className = "shrink-0 text-sm font-medium text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-50 disabled:opacity-50",
  label = "삭제",
  onDeleted,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!window.confirm(confirmMessage)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/health-check/submissions/${submissionId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(data.error ?? "삭제에 실패했습니다.");
        return;
      }
      onDeleted?.();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={handleDelete} disabled={loading} className={className}>
      {loading ? "삭제 중…" : label}
    </button>
  );
}

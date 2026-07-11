"use client";

import { useState } from "react";
import { saveXlsxBuffer, isXlsxBuffer } from "@/lib/fileDownload";
import { healthCheckExportFilename } from "@/lib/healthCheckExport";
import { todayKstYmd } from "@/lib/dateUtils";

type Props = {
  className?: string;
};

export default function HealthCheckExportButton({ className }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch(`/api/health-check/export?dl=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });

      const buffer = await res.arrayBuffer();

      if (!res.ok) {
        let message = `다운로드 실패 (${res.status})`;
        try {
          const err = JSON.parse(new TextDecoder().decode(buffer)) as { error?: string };
          if (err.error) message = err.error;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }

      if (!isXlsxBuffer(buffer)) {
        throw new Error("엑셀 파일 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }

      saveXlsxBuffer(buffer, healthCheckExportFilename(todayKstYmd()));
    } catch (e) {
      alert(e instanceof Error ? e.message : "엑셀 다운로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className={className}
    >
      {loading ? "다운로드 중..." : "엑셀 다운로드"}
    </button>
  );
}

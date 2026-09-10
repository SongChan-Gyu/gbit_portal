"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { saveXlsxBuffer, isXlsxBuffer } from "@/lib/fileDownload";
import { employeeExportFilename } from "@/lib/employeeExcel";
import { todayKstYmd } from "@/lib/dateUtils";

type Props = {
  className?: string;
};

export default function EmployeeExcelExportButton({ className }: Props) {
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState(false);
  const [externalOnly, setExternalOnly] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ dl: String(Date.now()) });
      if (brief) qs.set("brief", "1");
      if (externalOnly) qs.set("external", "1");
      const res = await fetch(`/api/admin/employees/export?${qs}`, {
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

      saveXlsxBuffer(buffer, employeeExportFilename(todayKstYmd(), { brief, externalOnly }));
    } catch (e) {
      alert(e instanceof Error ? e.message : "엑셀 다운로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className={`inline-flex items-center justify-center gap-1.5 ${className ?? ""}`}
      >
        <Download size={16} />
        {loading ? "다운로드 중..." : "사원정보 엑셀 다운로드"}
      </button>
      <label
        className="inline-flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap cursor-pointer select-none"
        title="체크하면 사번, 이름, 생년월일만 내려받습니다"
      >
        <input
          type="checkbox"
          className="rounded border-gray-300"
          checked={brief}
          onChange={(e) => setBrief(e.target.checked)}
        />
        간략
      </label>
      <label
        className="inline-flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap cursor-pointer select-none"
        title="체크하면 외부개발자만 내려받습니다"
      >
        <input
          type="checkbox"
          className="rounded border-gray-300"
          checked={externalOnly}
          onChange={(e) => setExternalOnly(e.target.checked)}
        />
        외부개발자
      </label>
    </div>
  );
}

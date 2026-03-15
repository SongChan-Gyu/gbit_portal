"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Download, Upload, CheckCircle, AlertCircle } from "lucide-react";
import {
  TEMPLATE_HEADERS,
  DUTY_DEPT_TO_LABEL,
  EMPLOYEE_TYPE_TO_LABEL,
  ROLE_TO_LABEL,
} from "@/lib/employeeExcel";
import type { ParsedEmployeeRow } from "@/lib/employeeExcel";

const SAMPLE_ROW: Record<string, string> = {
  이름: "홍길동",
  팀: "개발팀",
  직급: "사원",
  직급부서: "운영부",
  입사일: "2024-01-15",
  생년월일: "1990-05-20",
  연락처: "010-1234-5678",
  이메일: "hong@example.com",
  고용유형: "정규직",
  역할: "팀원",
};

function dutyDeptLabel(code: string): string {
  return DUTY_DEPT_TO_LABEL[code] || code || "-";
}
function employeeTypeLabel(code: string): string {
  return EMPLOYEE_TYPE_TO_LABEL[code] || code || "-";
}
function roleLabel(code: string): string {
  return ROLE_TO_LABEL[code] || code || "-";
}

export default function ExcelImportBlock() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"idle" | "preview" | "done">("idle");
  const [previewRows, setPreviewRows] = useState<ParsedEmployeeRow[]>([]);
  const [previewErrors, setPreviewErrors] = useState<string[]>([]);
  const [previewMessage, setPreviewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [resultErrors, setResultErrors] = useState<{ row: number; message: string }[]>([]);

  async function downloadTemplate() {
    const apiPath = "/api/admin/employees/import-template";
    const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${apiPath}` : apiPath;
    try {
      const res = await fetch(fullUrl, { credentials: "include" });
      if (!res.ok) {
        const ct = res.headers.get("content-type");
        if (ct?.includes("application/json")) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `다운로드 실패 (${res.status})`);
        }
        throw new Error(`다운로드 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "사원_일괄등록_양식.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "다운로드 실패";
      alert(msg + "\n\n아래 링크를 우클릭 → '다른 이름으로 링크 저장'으로 저장해 보세요.");
      window.open(fullUrl, "_blank");
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setPreviewRows([]);
    setPreviewErrors([]);
    setPreviewMessage("");
    setStep("idle");

    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch("/api/admin/employees/import-preview", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setLoading(false);
    if (e.target) (e.target as HTMLInputElement).value = "";

    if (!res.ok) {
      setPreviewMessage(data.error || "파일 처리 실패");
      return;
    }
    setPreviewRows(data.rows ?? []);
    setPreviewErrors(data.errors ?? []);
    setPreviewMessage(data.message ?? "");
    setStep(data.rows?.length ? "preview" : "idle");
  }

  async function confirmImport() {
    if (!previewRows.length) return;
    setConfirmLoading(true);
    setResultMessage("");
    setResultErrors([]);

    const confirmPath = "/api/admin/employees/import-confirm";
    const confirmUrl = typeof window !== "undefined" ? `${window.location.origin}${confirmPath}` : confirmPath;
    const res = await fetch(confirmUrl, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: previewRows }),
    });
    const data = await res.json();
    setConfirmLoading(false);

    if (!res.ok) {
      setResultMessage(data.error || "등록 실패");
      return;
    }
    setResultMessage(data.message ?? `${data.createdCount}명 등록 완료`);
    setResultErrors(data.errors ?? []);
    setStep("done");
    if (data.createdCount > 0) {
      router.refresh();
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm space-y-6">
      <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
        <FileSpreadsheet size={20} />
        엑셀 일괄 등록
      </h2>

      {/* 1. 양식 미리보기 */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">양식 미리보기</h3>
        <p className="text-xs text-gray-500 mb-3">
          아래 컬럼 순서대로 엑셀을 작성하세요. 1행은 헤더, 2행부터 데이터를 넣습니다.
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {TEMPLATE_HEADERS.map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                {TEMPLATE_HEADERS.map((h) => (
                  <td key={h} className="px-3 py-2 text-gray-700">
                    {SAMPLE_ROW[h] ?? "-"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          직급: 사원/대리/과장/차장/부장/이사 · 직급부서: 운영부/교육부/복지부/해당사항없음 · 고용유형: 정규직/프리랜서/외부개발자 · 역할: 팀원/팀장/PM/관리자
        </p>
      </div>

      {/* 2. 템플릿 다운로드 + 파일 선택 */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-center">
        <button
          type="button"
          onClick={downloadTemplate}
          className="btn-secondary inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg"
        >
          <Download size={18} />
          엑셀 템플릿 다운로드
        </button>
        <a
          href="/api/admin/employees/import-template"
          download="사원_일괄등록_양식.xlsx"
          className="text-sm text-gray-500 hover:text-blue-600 underline"
        >
          링크로 저장 (다운로드 안 될 때)
        </a>
        <label className="btn-primary inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg cursor-pointer">
          <Upload size={18} />
          {loading ? "처리 중..." : "엑셀 파일 선택"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={onFileChange}
            disabled={loading}
          />
        </label>
      </div>

      {/* 3. 미리보기 결과 */}
      {previewMessage && (
        <p className={`text-sm flex items-center gap-2 ${previewRows.length ? "text-blue-600" : "text-amber-600"}`}>
          {previewRows.length ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {previewMessage}
        </p>
      )}
      {previewErrors.length > 0 && (
        <ul className="text-sm text-amber-700 space-y-1">
          {previewErrors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      )}

      {step === "preview" && previewRows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr className="border-b border-gray-200">
                  <th className="px-2 py-2 text-left font-medium text-gray-500 w-12">행</th>
                  {TEMPLATE_HEADERS.map((h) => (
                    <th key={h} className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/50">
                    <td className="px-2 py-1.5 text-gray-400">{r._rowIndex}</td>
                    <td className="px-2 py-1.5 font-medium">{r.name}</td>
                    <td className="px-2 py-1.5">{r.team || "-"}</td>
                    <td className="px-2 py-1.5">{r.position}</td>
                    <td className="px-2 py-1.5">{dutyDeptLabel(r.dutyDept)}</td>
                    <td className="px-2 py-1.5">{r.hireDate}</td>
                    <td className="px-2 py-1.5">{r.birthDate || "-"}</td>
                    <td className="px-2 py-1.5">{r.phone || "-"}</td>
                    <td className="px-2 py-1.5">{r.email || "-"}</td>
                    <td className="px-2 py-1.5">{employeeTypeLabel(r.employeeType)}</td>
                    <td className="px-2 py-1.5">{roleLabel(r.role)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={confirmImport}
            disabled={confirmLoading}
            className="btn-primary inline-flex items-center gap-2 py-2.5 px-5 rounded-lg font-medium"
          >
            {confirmLoading ? "등록 중..." : "위 내용으로 일괄 등록"}
          </button>
        </>
      )}

      {/* 4. 등록 결과 */}
      {step === "done" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-800 flex items-center gap-2">
            <CheckCircle size={18} className="text-green-600" />
            {resultMessage}
          </p>
          {resultErrors.length > 0 && (
            <ul className="mt-2 text-sm text-amber-700 space-y-1">
              {resultErrors.map((e, i) => (
                <li key={i}>
                  {e.row}행: {e.message}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setStep("idle")}
            className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            다른 파일로 다시 등록
          </button>
        </div>
      )}
    </div>
  );
}

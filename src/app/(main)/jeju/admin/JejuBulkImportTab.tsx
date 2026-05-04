"use client";

import { useRef, useState } from "react";
import { Upload, Download, CheckCircle, AlertTriangle, XCircle, ChevronDown } from "lucide-react";

type Candidate = {
  id: string;
  name: string;
  empNo: string;
  teamName: string | null;
  employeeType: string;
};

type PreviewRow = {
  rowNum: number;
  applicantName: string;
  applicantEmpNo: string;
  startDate: string;
  endDate: string;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  depositorName: string;
  note: string;
  matchedEmployeeId: string | null;
  matchedEmpNo: string | null;
  matchedTeam: string | null;
  matchedType: string | null;
  matchCandidates: Candidate[];
  error: string | null;
};

type ConfirmResult = { rowNum: number; id?: string; error?: string };

export default function JejuBulkImportTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string>>({}); // rowNum → employeeId
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<ConfirmResult[] | null>(null);
  const [step, setStep] = useState<"idle" | "preview" | "done">("idle");

  async function handleUpload(file: File) {
    setUploading(true);
    setRows([]);
    setOverrides({});
    setResults(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/jeju/admin/bulk-import?action=preview", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) { alert(data.error ?? "파싱 오류"); return; }
    setRows(data.rows ?? []);
    setStep("preview");
  }

  function setOverride(rowNum: number, empId: string) {
    setOverrides((p) => ({ ...p, [rowNum]: empId }));
  }

  function resolvedEmpId(row: PreviewRow): string | null {
    return overrides[row.rowNum] ?? row.matchedEmployeeId;
  }

  const readyRows = rows.filter((r) => resolvedEmpId(r) && !dateError(r));
  const errorRows = rows.filter((r) => !resolvedEmpId(r) || dateError(r));

  function dateError(row: PreviewRow) {
    if (!row.startDate || !row.endDate) return "날짜 없음";
    if (row.startDate >= row.endDate) return "날짜 오류";
    return null;
  }

  async function handleConfirm() {
    if (!readyRows.length) { alert("저장 가능한 행이 없습니다."); return; }
    if (!confirm(`${readyRows.length}건을 이관 처리로 저장합니다. 계속할까요?`)) return;
    setConfirming(true);
    const payload = readyRows.map((r) => ({
      rowNum: r.rowNum,
      employeeId: resolvedEmpId(r)!,
      startDate: r.startDate,
      endDate: r.endDate,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestCount: r.guestCount,
      depositorName: r.depositorName,
      note: r.note,
    }));
    const res = await fetch("/api/jeju/admin/bulk-import?action=confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payload }),
    });
    const data = await res.json();
    setConfirming(false);
    setResults(data.results ?? []);
    setStep("done");
  }

  function reset() {
    setRows([]); setOverrides({}); setResults(null); setStep("idle");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-5">
      {/* 안내 */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold mb-1">엑셀 일괄 이관 등록</p>
        <p>기존 제주 숙소 이용 내역을 엑셀로 한꺼번에 등록합니다. 모든 건은 <strong>승인 완료 + 입금확인</strong> 상태로 저장됩니다.</p>
        <p className="mt-1">• 신청자사번이 있으면 자동 매핑, 없으면 이름으로 매핑합니다. 동명이인·미등록 사원은 직접 선택해 주세요.</p>
      </div>

      {/* 템플릿 다운로드 + 업로드 */}
      <div className="flex flex-wrap gap-3 items-center">
        <a
          href="/api/jeju/admin/bulk-import-template"
          className="inline-flex items-center gap-1.5 text-sm text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-3 py-2 hover:bg-blue-100"
        >
          <Download size={15} /> 양식 다운로드
        </a>
        <label className="inline-flex items-center gap-1.5 text-sm text-gray-700 border border-gray-200 bg-white rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer">
          <Upload size={15} />
          {uploading ? "파싱 중..." : "엑셀 업로드"}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </label>
        {step !== "idle" && (
          <button type="button" onClick={reset} className="text-sm text-gray-500 hover:text-gray-700 underline">
            초기화
          </button>
        )}
      </div>

      {/* 미리보기 */}
      {step === "preview" && rows.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-gray-700">
              총 {rows.length}행 — 저장 가능{" "}
              <span className="text-green-700 font-semibold">{readyRows.length}건</span>
              {errorRows.length > 0 && (
                <span className="text-red-600 ml-2">/ 오류·미매핑 {errorRows.length}건</span>
              )}
            </p>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={confirming || readyRows.length === 0}
              className="btn-primary text-sm px-4 py-2 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <CheckCircle size={15} />
              {confirming ? "저장 중..." : `${readyRows.length}건 이관 저장`}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">행</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">상태</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">신청자명</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">매핑 사원</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">입실일</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">퇴실일</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">투숙객</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">연락처</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">인원</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">입금자</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">메모</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => {
                  const empId = resolvedEmpId(row);
                  const dErr = dateError(row);
                  const ok = !!empId && !dErr;
                  const needSelect = !empId;
                  return (
                    <tr key={row.rowNum} className={ok ? "bg-white" : "bg-red-50"}>
                      <td className="px-3 py-2 text-gray-400">{row.rowNum}</td>
                      <td className="px-3 py-2">
                        {ok ? (
                          <CheckCircle size={14} className="text-green-500" />
                        ) : (
                          <AlertTriangle size={14} className="text-red-500" />
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800">{row.applicantName}</td>
                      <td className="px-3 py-2 min-w-[160px]">
                        {empId ? (
                          <span className="text-green-700">
                            {row.matchCandidates.find((c) => c.id === empId)?.name ?? row.applicantName}
                            {row.matchedEmpNo && <span className="text-gray-400 ml-1">({overrides[row.rowNum]
                              ? row.matchCandidates.find((c) => c.id === overrides[row.rowNum])?.empNo
                              : row.matchedEmpNo})</span>}
                            {row.matchedType === "EXTERNAL" && (
                              <span className="ml-1 text-xs bg-purple-100 text-purple-700 px-1 rounded">외부</span>
                            )}
                          </span>
                        ) : (
                          <MappingSelect
                            row={row}
                            value={overrides[row.rowNum] ?? ""}
                            onChange={(id) => setOverride(row.rowNum, id)}
                          />
                        )}
                        {!empId && !needSelect && row.error && (
                          <p className="text-red-500 text-xs mt-0.5">{row.error}</p>
                        )}
                      </td>
                      <td className={`px-3 py-2 ${dErr ? "text-red-500" : "text-gray-700"}`}>{row.startDate || "—"}</td>
                      <td className={`px-3 py-2 ${dErr ? "text-red-500" : "text-gray-700"}`}>{row.endDate || "—"}</td>
                      <td className="px-3 py-2 text-gray-700">{row.guestName}</td>
                      <td className="px-3 py-2 text-gray-600">{row.guestPhone}</td>
                      <td className="px-3 py-2 text-gray-700">{row.guestCount}</td>
                      <td className="px-3 py-2 text-gray-700">{row.depositorName}</td>
                      <td className="px-3 py-2 text-gray-400 max-w-[120px] truncate">{row.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {errorRows.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 space-y-1">
              <p className="font-semibold flex items-center gap-1"><XCircle size={14} /> 오류 행 ({errorRows.length}건) — 직접 선택하거나 수정 후 재업로드하세요.</p>
              {errorRows.map((r) => (
                <p key={r.rowNum} className="text-xs">행 {r.rowNum}: {r.applicantName} — {r.error ?? (dateError(r) ? `날짜 오류 (${r.startDate}~${r.endDate})` : "사원 미매핑")}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 결과 */}
      {step === "done" && results && (
        <div className="space-y-3">
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            <p className="font-semibold">저장 완료</p>
            <p>성공 {results.filter((r) => r.id).length}건 / 실패 {results.filter((r) => r.error).length}건</p>
          </div>
          {results.filter((r) => r.error).map((r) => (
            <p key={r.rowNum} className="text-xs text-red-600">행 {r.rowNum}: {r.error}</p>
          ))}
          <button type="button" onClick={reset} className="text-sm text-blue-600 hover:underline">
            다시 업로드
          </button>
        </div>
      )}
    </div>
  );
}

function MappingSelect({
  row,
  value,
  onChange,
}: {
  row: PreviewRow;
  value: string;
  onChange: (id: string) => void;
}) {
  if (row.matchCandidates.length > 0) {
    return (
      <div>
        <p className="text-xs text-orange-600 mb-0.5">동명이인 — 선택 필요</p>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input text-xs py-0.5 px-1 h-7 w-full"
        >
          <option value="">— 선택 —</option>
          {row.matchCandidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.empNo}){c.teamName ? ` · ${c.teamName}` : ""}{c.employeeType === "EXTERNAL" ? " [외부]" : ""}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <p className="text-red-500 text-xs">
      <XCircle size={12} className="inline mr-0.5" />
      {row.error ?? "미등록 사원"}
    </p>
  );
}

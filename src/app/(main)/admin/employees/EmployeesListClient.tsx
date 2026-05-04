"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import InviteButton from "./InviteButton";
import AlimtalkInviteButton from "./AlimtalkInviteButton";
import ResetPasswordButton from "./ResetPasswordButton";
import DirectIssueButton from "./DirectIssueButton";
import { employeeStatusMeta } from "@/lib/statusMeta";

type Emp = {
  id: string;
  empNo: string;
  name: string;
  teamName: string | null;
  position: string;
  dutyDept: string | null;
  employeeType: string | null;
  role: string;
  status: string;
  username: string | null;
  hireDate: string;
  birthDate: string | null;
  phone: string;
  email: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  STAFF: "팀원",
  TEAM_LEAD: "팀장",
  PM: "PM",
  ADMIN: "관리자",
};
const DUTY_DEPT_LABEL: Record<string, string> = {
  OPERATIONS: "운영부",
  EDUCATION: "교육부",
  WELFARE: "복지부",
  NONE: "해당사항없음",
};
function dutyDeptDisplay(dutyDept: string | null): string {
  if (!dutyDept) return "-";
  return DUTY_DEPT_LABEL[dutyDept] ?? dutyDept;
}
function formatYMD(iso: string) {
  return iso.slice(0, 10);
}

type Tab = "internal" | "external";

export default function EmployeesListClient({ employees }: { employees: Emp[] }) {
  const [tab, setTab] = useState<Tab>("internal");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMethod, setBulkMethod] = useState<"EMAIL_INVITE" | "DIRECT_CREDENTIAL">("EMAIL_INVITE");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [bulkError, setBulkError] = useState("");

  const internalEmployees = useMemo(() => employees.filter((e) => e.employeeType !== "EXTERNAL"), [employees]);
  const externalEmployees = useMemo(() => employees.filter((e) => e.employeeType === "EXTERNAL"), [employees]);
  const visibleEmployees = tab === "external" ? externalEmployees : internalEmployees;

  const ids = useMemo(() => visibleEmployees.map((e) => e.id), [visibleEmployees]);
  const selectedIds = useMemo(() => ids.filter((id) => selected[id]), [ids, selected]);

  const selectableIds = useMemo(
    () => visibleEmployees.filter((e) => !e.username).map((e) => e.id),
    [visibleEmployees]
  );
  const directExpectedFailCount = useMemo(
    () => visibleEmployees.filter((e) => !e.username).filter((e) => String(e.phone ?? "").replace(/[^0-9]/g, "").length < 8 || !e.birthDate).length,
    [visibleEmployees],
  );

  function switchTab(t: Tab) {
    setTab(t);
    setSelected({});
    setBulkResult(null);
    setBulkError("");
  }

  function toggleAllEligible(v: boolean) {
    const next: Record<string, boolean> = { ...selected };
    for (const id of selectableIds) next[id] = v;
    setSelected(next);
  }

  async function bulkSend() {
    setBulkError("");
    setBulkResult(null);
    if (selectedIds.length === 0) {
      setBulkError("선택된 사원이 없습니다.");
      return;
    }
    setBulkLoading(true);
    try {
      let endpoint: string;
      if (tab === "external") {
        endpoint = "/api/admin/invite/alimtalk-bulk";
      } else if (bulkMethod === "EMAIL_INVITE") {
        endpoint = "/api/admin/invite/bulk";
      } else {
        endpoint = "/api/admin/employees/provision-direct/bulk";
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: selectedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBulkError(data.error ?? "일괄 발송에 실패했습니다.");
      } else {
        setBulkResult(data);
      }
    } catch {
      setBulkError("요청 중 오류가 발생했습니다.");
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* 탭 */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => switchTab("internal")}
          className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            tab === "internal"
              ? "border-blue-600 text-blue-700 bg-blue-50/60"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          내부직원 <span className="ml-1 text-xs text-gray-400">({internalEmployees.length})</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab("external")}
          className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            tab === "external"
              ? "border-yellow-500 text-yellow-700 bg-yellow-50/60"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          외부개발자 <span className="ml-1 text-xs text-gray-400">({externalEmployees.length})</span>
        </button>
      </div>

      {/* 일괄 처리 패널 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm text-gray-700">
          <p className="font-semibold">계정 발급 일괄 처리</p>
          {tab === "external" ? (
            <p className="text-xs text-gray-500 mt-1">
              외부개발자는 <span className="font-semibold text-yellow-700">알림톡(카카오) 초대</span>로 가입 링크를 발송합니다.
              이미 계정이 있거나 전화번호가 없으면 자동 스킵됩니다.{" "}
              <span className="font-semibold text-blue-700">※ 일괄 발송은 5/11 예정입니다.</span>
            </p>
          ) : (
            <>
              <div className="mt-2 flex gap-3 text-xs">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={bulkMethod === "EMAIL_INVITE"}
                    onChange={() => setBulkMethod("EMAIL_INVITE")}
                  />
                  이메일 초대
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={bulkMethod === "DIRECT_CREDENTIAL"}
                    onChange={() => setBulkMethod("DIRECT_CREDENTIAL")}
                  />
                  직접 발급
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                한 사원당 이메일 초대/직접 발급 중 하나만 적용됩니다. 이미 계정이 있으면 자동 스킵됩니다.
                {bulkMethod === "DIRECT_CREDENTIAL" && directExpectedFailCount > 0 && (
                  <span className="ml-1 text-amber-700">· 예상 스킵 {directExpectedFailCount}명(휴대폰/생년월일 누락)</span>
                )}
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={() => toggleAllEligible(true)}>
            발송대상 전체선택
          </button>
          <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={() => toggleAllEligible(false)}>
            선택 해제
          </button>
          <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={bulkSend} disabled={bulkLoading}>
            {bulkLoading
              ? "발송 중..."
              : tab === "external"
                ? `선택 ${selectedIds.length}명 알림톡 초대`
                : bulkMethod === "EMAIL_INVITE"
                  ? `선택 ${selectedIds.length}명 이메일 초대`
                  : `선택 ${selectedIds.length}명 직접 발급`}
          </button>
        </div>
      </div>

      {bulkError && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">{bulkError}</div>
      )}
      {bulkResult?.summary && (
        <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 px-4 py-2 text-sm space-y-2">
          <p>
            완료 {bulkResult.summary.sent} · 스킵 {bulkResult.summary.skipped} · 실패 {bulkResult.summary.failed}
          </p>
          {Array.isArray(bulkResult.results) && bulkResult.results.length > 0 && (
            <div className="max-h-44 overflow-y-auto rounded border border-green-200 bg-white/70 p-2 space-y-1 text-xs">
              {bulkResult.results.map((r: any, idx: number) => (
                <p key={`${r.employeeId}-${idx}`} className="text-gray-700">
                  [{r.status}] {r.name}
                  {r.username ? ` (${r.username})` : ""}
                  {r.reason ? ` - ${r.reason}` : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PC: 테이블 */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="data-table w-full min-w-[980px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">
                <input
                  type="checkbox"
                  checked={selectableIds.length > 0 && selectableIds.every((id) => selected[id])}
                  onChange={(e) => toggleAllEligible(e.target.checked)}
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">사번</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">이름</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">팀</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">직급</th>
              {tab === "internal" && (
                <>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">직급부서</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">입사일</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">이메일</th>
                </>
              )}
              {tab === "external" && (
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">연락처</th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">상태</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">아이디</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">액션</th>
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((emp) => {
              const selectable = !emp.username;
              return (
                <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50/50 last:border-0">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={!!selected[emp.id]}
                      disabled={!selectable}
                      onChange={(e) => setSelected((p) => ({ ...p, [emp.id]: e.target.checked }))}
                      title={selectable ? "선택" : "이미 계정 있음"}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-sm">{emp.empNo || "-"}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{emp.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{emp.teamName ?? "-"}</td>
                  <td className="px-4 py-3 text-sm">{emp.position}</td>
                  {tab === "internal" && (
                    <>
                      <td className="px-4 py-3 text-xs text-gray-600">{dutyDeptDisplay(emp.dutyDept)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatYMD(emp.hireDate)}</td>
                      <td className="px-4 py-3 text-xs">
                        {emp.email?.trim() ? (
                          <span className="text-green-700 font-medium" title={emp.email}>등록됨</span>
                        ) : (
                          <span className="text-gray-400">없음</span>
                        )}
                      </td>
                    </>
                  )}
                  {tab === "external" && (
                    <td className="px-4 py-3 text-sm text-gray-600">{emp.phone || "-"}</td>
                  )}
                  <td className="px-4 py-3">
                    {(() => {
                      const st = employeeStatusMeta(emp.status);
                      return <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.badge}`}>{st.label}</span>;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-sm">{emp.username ?? "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <Link href={`/admin/employees/${emp.id}`} className="text-sm text-blue-600 hover:text-blue-800 font-medium">수정</Link>
                      {tab === "external" ? (
                        <AlimtalkInviteButton employeeId={emp.id} name={emp.name} phone={emp.phone} hasUser={!!emp.username} />
                      ) : (
                        <>
                          <InviteButton employeeId={emp.id} name={emp.name} hasUser={!!emp.username} />
                          <DirectIssueButton employeeId={emp.id} name={emp.name} hasUser={!!emp.username} />
                        </>
                      )}
                      <ResetPasswordButton employeeId={emp.id} name={emp.name} hasUser={!!emp.username} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 */}
      <div className="md:hidden space-y-4">
        {visibleEmployees.map((emp) => {
          const selectable = !emp.username;
          return (
            <div key={emp.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!selected[emp.id]}
                      disabled={!selectable}
                      onChange={(e) => setSelected((p) => ({ ...p, [emp.id]: e.target.checked }))}
                    />
                    <p className="font-semibold text-gray-800 text-base truncate">
                      {emp.name}
                      {emp.empNo && <span className="ml-2 text-sm text-gray-500 font-normal">{emp.empNo}</span>}
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 mt-0.5">{emp.teamName ?? "-"} · {emp.position}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                    {(() => {
                      const st = employeeStatusMeta(emp.status);
                      return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.badge}`}>{st.label}</span>;
                    })()}
                    {tab === "external" ? (
                      <span className="text-xs text-gray-500">{emp.phone || "연락처없음"}</span>
                    ) : (
                      <span className={emp.email?.trim() ? "text-xs text-green-700 font-medium" : "text-xs text-gray-400"}>
                        이메일 {emp.email?.trim() ? "등록" : "없음"}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{ROLE_LABEL[emp.role] ?? emp.role}</span>
                  </div>
                  {tab === "internal" && <p className="text-xs text-gray-400 mt-1.5">입사 {formatYMD(emp.hireDate)}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100">
                <Link href={`/admin/employees/${emp.id}`}
                  className="flex-1 min-w-0 py-2.5 rounded-lg text-center text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
                  수정
                </Link>
                {tab === "external" ? (
                  <div className="flex-1 min-w-0">
                    <AlimtalkInviteButton employeeId={emp.id} name={emp.name} phone={emp.phone} hasUser={!!emp.username} buttonClassName="w-full justify-center py-2.5 text-sm" />
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <InviteButton employeeId={emp.id} name={emp.name} hasUser={!!emp.username} buttonClassName="w-full justify-center py-2.5 text-sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <DirectIssueButton employeeId={emp.id} name={emp.name} hasUser={!!emp.username} buttonClassName="w-full justify-center py-2.5 text-sm" />
                    </div>
                  </>
                )}
                {emp.username && (
                  <div className="flex-1 min-w-0">
                    <ResetPasswordButton employeeId={emp.id} name={emp.name} hasUser={!!emp.username} buttonClassName="w-full justify-center py-2.5 text-sm" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


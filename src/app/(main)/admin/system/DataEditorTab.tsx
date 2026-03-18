"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Edit2, Check, X, HelpCircle } from "lucide-react";
import {
  DATA_EDITOR_FIELD_DESCRIPTIONS,
  SYSTEM_CONFIG_KEY_DESCRIPTIONS,
} from "./data-editor-field-desc";

const TABLES = [
  { id: "SystemConfig", label: "시스템 설정 (키-값)", editable: true },
  { id: "Team", label: "팀", editable: true },
  { id: "AllocationSourceConfig", label: "귀속연도 부여 구분", editable: true },
  { id: "SchedulerJobType", label: "스케줄러 유형", editable: true },
  { id: "Employee", label: "사원", editable: false },
  { id: "User", label: "사용자 계정", editable: false },
  { id: "Notice", label: "공지사항", editable: false },
  { id: "Form", label: "유동 양식", editable: false },
  { id: "JejuAccommodation", label: "제주 숙소 신청", editable: false },
  { id: "LeaveRequest", label: "휴가 신청", editable: false },
  { id: "LeaveType", label: "휴가 유형", editable: false },
  { id: "LeaveAllocation", label: "휴가 할당", editable: false },
  { id: "AuditLog", label: "감사 로그", editable: false },
  { id: "SchedulerLog", label: "스케줄러 실행 이력", editable: false },
  { id: "NotificationLog", label: "알림 발송 로그", editable: false },
  { id: "InviteToken", label: "초대 토큰", editable: false },
  { id: "FormSubmission", label: "양식 제출", editable: false },
  { id: "RequestLog", label: "요청(접속) 로그", editable: false },
] as const;

type TableId = (typeof TABLES)[number]["id"];
const EDITABLE_TABLES: Set<string> = new Set(TABLES.filter((t) => t.editable).map((t) => t.id));
const PAGE_SIZE = 50;

function FieldLabel({
  tableId,
  fieldKey,
  label,
}: {
  tableId: string;
  fieldKey: string;
  label?: string;
}) {
  const desc = DATA_EDITOR_FIELD_DESCRIPTIONS[tableId]?.[fieldKey];
  const display = label ?? fieldKey;
  if (!desc) return <span>{display}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {display}
      <span
        className="text-gray-400 cursor-help"
        title={desc}
          >
        <HelpCircle className="w-3.5 h-3.5" />
      </span>
    </span>
  );
}

export default function DataEditorTab() {
  const [table, setTable] = useState<TableId>("SystemConfig");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; empNo: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ id?: string; key?: string } | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const isEditable = EDITABLE_TABLES.has(table);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({ table });
      if (!isEditable) {
        params.set("page", String(page));
        params.set("pageSize", String(PAGE_SIZE));
      }
      const res = await fetch(`/api/admin/data?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "조회 실패");
      if (Array.isArray(data)) {
        setRows(data);
        setTotal(null);
      } else {
        setRows(data.rows ?? []);
        setTotal(typeof data.total === "number" ? data.total : null);
      }
    } catch (e: any) {
      setMessage({ type: "err", text: e?.message ?? "로드 실패" });
      setRows([]);
      setTotal(null);
    } finally {
      setLoading(false);
    }
  }, [table, page, isEditable]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setTotal(null);
    setEditing(null);
    setEditForm({});
  }, [table]);

  useEffect(() => {
    if (table !== "Team") return;
    fetch("/api/admin/data/employees")
      .then((r) => r.json())
      .then((list) => setEmployees(Array.isArray(list) ? list : []))
      .catch(() => setEmployees([]));
  }, [table]);

  const startEdit = (row: Record<string, unknown>) => {
    if (table === "SystemConfig") {
      setEditing({ key: row.key as string });
      setEditForm({ key: row.key, value: row.value });
    } else {
      setEditing({ id: row.id as string });
      const copy = { ...row };
      delete copy.createdAt;
      delete copy.updatedAt;
      delete copy.leaderName;
      setEditForm(copy);
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditForm({});
  };

  const saveEdit = async () => {
    setMessage(null);
    try {
      const body: { table: string; id?: string; key?: string; data: Record<string, unknown> } = {
        table,
        data: editForm as Record<string, unknown>,
      };
      if (table === "SystemConfig") body.key = editForm.key as string;
      else body.id = editForm.id as string;
      const res = await fetch("/api/admin/data", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      setMessage({ type: "ok", text: "저장되었습니다." });
      setEditing(null);
      setEditForm({});
      load();
    } catch (e: any) {
      setMessage({ type: "err", text: e?.message ?? "저장 실패" });
    }
  };

  const tableKeys = isEditable
    ? (table === "SystemConfig"
        ? ["key", "value", "updatedAt"]
        : table === "Team"
          ? ["name", "sortOrder", "leaderName", "leaderId"]
          : table === "AllocationSourceConfig"
            ? ["sourceCode", "label", "sortOrder", "isActive", "defaultDays", "note"]
            : ["jobKey", "name", "description", "sortOrder", "isActive"])
    : (rows[0] ? Object.keys(rows[0]) : []);

  const keyLabel: Record<string, string> = {
    key: "키",
    value: "값",
    updatedAt: "수정일시",
    name: "이름",
    sortOrder: "정렬",
    leaderName: "팀장",
    leaderId: "팀장 ID",
    sourceCode: "코드",
    label: "표시명",
    isActive: "사용",
    defaultDays: "기본일수",
    note: "비고",
    jobKey: "작업키",
    description: "설명",
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        DB 기준 데이터를 직접 조회합니다. 수정 가능 테이블: 시스템 설정, 팀, 귀속연도 부여 구분, 스케줄러 유형. 그 외 테이블은 읽기 전용·페이지네이션으로 조회됩니다.
      </p>

      {/* 테이블 선택 */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700">테이블:</label>
        <select
          value={table}
          onChange={(e) => setTable(e.target.value as TableId)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 bg-white min-w-[200px]"
        >
          {TABLES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label} {t.editable ? "" : "(읽기전용)"}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="p-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "ok" ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      {/* 편집 폼 (모달 스타일) */}
      {editing && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <h3 className="font-medium text-gray-800">행 수정</h3>
          {table === "SystemConfig" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  <FieldLabel tableId={table} fieldKey="key" label="키" />
                </label>
                <input
                  value={(editForm.key as string) ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, key: e.target.value }))}
                  className="w-full max-w-md rounded border border-gray-300 px-2 py-1.5 text-sm"
                  readOnly
                />
                {SYSTEM_CONFIG_KEY_DESCRIPTIONS[editForm.key as string] && (
                  <p className="text-xs text-gray-500 mt-1">
                    {SYSTEM_CONFIG_KEY_DESCRIPTIONS[editForm.key as string]}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  <FieldLabel tableId={table} fieldKey="value" label="값 (JSON)" />
                </label>
                <textarea
                  value={(editForm.value as string) ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
                  className="w-full max-w-2xl rounded border border-gray-300 px-2 py-1.5 text-sm font-mono min-h-[120px]"
                />
              </div>
            </>
          )}
          {table === "Team" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  <FieldLabel tableId={table} fieldKey="name" label="팀명" />
                </label>
                <input
                  value={(editForm.name as string) ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full max-w-md rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  <FieldLabel tableId={table} fieldKey="sortOrder" label="정렬 순서" />
                </label>
                <input
                  type="number"
                  value={(editForm.sortOrder as number) ?? 0}
                  onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                  className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  <FieldLabel tableId={table} fieldKey="leaderId" label="팀장" />
                </label>
                <select
                  value={(editForm.leaderId as string) ?? ""}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, leaderId: e.target.value || null }))
                  }
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="">없음</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.empNo})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          {table === "AllocationSourceConfig" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    <FieldLabel tableId={table} fieldKey="label" />
                  </label>
                  <input
                    value={(editForm.label as string) ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    <FieldLabel tableId={table} fieldKey="sortOrder" />
                  </label>
                  <input
                    type="number"
                    value={(editForm.sortOrder as number) ?? 0}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))
                    }
                    className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    <FieldLabel tableId={table} fieldKey="defaultDays" />
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={(editForm.defaultDays as number) ?? ""}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        defaultDays: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={!!editForm.isActive}
                      onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                      className="rounded border-gray-300"
                    />
                    <FieldLabel tableId={table} fieldKey="isActive" />
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  <FieldLabel tableId={table} fieldKey="note" />
                </label>
                <input
                  value={(editForm.note as string) ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                  className="w-full max-w-md rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </>
          )}
          {table === "SchedulerJobType" && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  <FieldLabel tableId={table} fieldKey="name" />
                </label>
                <input
                  value={(editForm.name as string) ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full max-w-md rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  <FieldLabel tableId={table} fieldKey="description" />
                </label>
                <input
                  value={(editForm.description as string) ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full max-w-md rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    <FieldLabel tableId={table} fieldKey="sortOrder" />
                  </label>
                  <input
                    type="number"
                    value={(editForm.sortOrder as number) ?? 0}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))
                    }
                    className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={!!editForm.isActive}
                      onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                      className="rounded border-gray-300"
                    />
                    <FieldLabel tableId={table} fieldKey="isActive" />
                  </label>
                </div>
              </div>
            </>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={saveEdit}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium"
            >
              <Check className="w-4 h-4" /> 저장
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-sm"
            >
              <X className="w-4 h-4" /> 취소
            </button>
          </div>
        </div>
      )}

      {/* 테이블 목록 */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-500">불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-500">데이터가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {isEditable && table !== "SystemConfig" && (
                  <th className="text-left py-2 px-3 font-medium text-gray-600">수정</th>
                )}
                {tableKeys.map((k) => (
                  <th key={k} className="text-left py-2 px-3 font-medium text-gray-600">
                    <FieldLabel tableId={table} fieldKey={k} label={keyLabel[k] ?? k} />
                  </th>
                ))}
                {isEditable && table === "SystemConfig" && (
                  <th className="text-left py-2 px-3 font-medium text-gray-600">수정</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={(row.id as string) ?? (row.key as string) ?? idx} className="border-b border-gray-100">
                  {isEditable && table !== "SystemConfig" && (
                    <td className="py-1.5 px-3">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="p-1 rounded text-gray-500 hover:bg-gray-100"
                        title="수정"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                  {tableKeys.map((k) => (
                    <td key={k} className="py-1.5 px-3 text-gray-800 max-w-[200px] truncate" title={String(row[k] ?? "-")}>
                      {k === "value" && typeof row[k] === "string" && (row[k] as string).length > 80
                        ? (row[k] as string).slice(0, 80) + "..."
                        : k === "isActive"
                          ? row[k]
                            ? "사용"
                            : "미사용"
                          : String(row[k] ?? "-")}
                    </td>
                  ))}
                  {isEditable && table === "SystemConfig" && (
                    <td className="py-1.5 px-3">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="p-1 rounded text-gray-500 hover:bg-gray-100"
                        title="수정"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 페이지네이션 (읽기 전용 테이블) */}
      {total !== null && total > 0 && (
        <div className="flex items-center justify-between gap-4 py-2">
          <p className="text-sm text-gray-600">
            전체 {total}건 중 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}건
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-50 hover:bg-gray-50"
            >
              이전
            </button>
            <span className="py-1 text-sm text-gray-600">
              {page} / {Math.ceil(total / PAGE_SIZE) || 1}
            </span>
            <button
              type="button"
              disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-50 hover:bg-gray-50"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

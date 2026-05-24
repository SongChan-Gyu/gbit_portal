"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Users, Search } from "lucide-react";

type GroupRow = {
  id: string;
  name: string;
  _count: { members: number; forms: number };
};

type PickerEmp = {
  id: string;
  name: string;
  empNo: string | null;
  employeeType: string;
  team: { name: string | null } | null;
  position: string | null;
};

export default function EmployeeGroupsClient({ initialGroups }: { initialGroups: GroupRow[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [employees, setEmployees] = useState<PickerEmp[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => {
      const team = e.team?.name?.toLowerCase() ?? "";
      return (
        e.name.toLowerCase().includes(q) ||
        (e.empNo?.toLowerCase().includes(q) ?? false) ||
        team.includes(q)
      );
    });
  }, [employees, search]);

  async function loadPicker() {
    if (employees) return;
    const res = await fetch("/api/admin/groups/picker-employees");
    if (!res.ok) return;
    const list = (await res.json()) as PickerEmp[];
    setEmployees(list);
  }

  function toggleCreate() {
    setError("");
    setCreating((v) => !v);
    if (!creating) void loadPicker();
  }

  function toggleEmployee(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = newName.trim();
    if (name.length < 1) {
      setError("그룹 이름을 입력하세요.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, employeeIds: [...selectedIds] }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError((data as { error?: string }).error ?? "생성 실패");
      return;
    }
    setNewName("");
    setSelectedIds(new Set());
    setCreating(false);
    router.refresh();
  }

  async function handleDelete(id: string, name: string, usageCount: number) {
    if (usageCount > 0) {
      alert(`「${name}」을(를) 사용 중인 항목이 있어 삭제할 수 없습니다.`);
      return;
    }
    if (!confirm(`그룹「${name}」을(를) 삭제할까요?`)) return;
    const res = await fetch(`/api/admin/groups/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert((data as { error?: string }).error ?? "삭제 실패");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          유동양식·공지·로그인 팝업에서 &quot;지정 그룹&quot;으로 선택하면, 접근·알림톡 대상이 이 목록과 동일하게 적용됩니다.
        </p>
        <button
          type="button"
          onClick={toggleCreate}
          className="btn-primary text-sm py-2 px-4 rounded-lg font-medium inline-flex items-center gap-1.5 shrink-0"
        >
          <Plus className="w-4 h-4" />
          {creating ? "닫기" : "새 그룹"}
        </button>
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4"
        >
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">{error}</div>
          )}
          <div>
            <label className="label">그룹 이름</label>
            <input
              className="input w-full max-w-md"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="예: 휴가샵 대상 인원"
              maxLength={120}
            />
          </div>
          <div>
            <label className="label flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
 포함할 사원
            </label>
            <div className="relative mb-2 max-w-xl">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="input w-full pl-9"
                placeholder="이름·사번·팀 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!employees}
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 space-y-1">
              {!employees ? (
                <p className="text-sm text-gray-500 py-4 text-center">사원 목록을 불러오는 중…</p>
              ) : filteredEmployees.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">검색 결과가 없습니다.</p>
              ) : (
                filteredEmployees.map((emp) => (
                  <label
                    key={emp.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(emp.id)}
                      onChange={() => toggleEmployee(emp.id)}
                      className="accent-indigo-600"
                    />
                    <span className="font-medium text-gray-800">{emp.name}</span>
                    <span className="text-gray-500 text-xs">
                      {emp.empNo ? `${emp.empNo} · ` : ""}
                      {emp.team?.name ?? "팀 없음"} · {emp.employeeType === "EXTERNAL" ? "외부" : "내부"}
                    </span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">선택 {selectedIds.size}명</p>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {saving ? "저장 중…" : "그룹 만들기"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setError("");
              }}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-white"
            >
              취소
            </button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {groups.map((g) => (
          <li
            key={g.id}
            className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="font-medium text-gray-900">{g.name}</span>
              <p className="text-xs text-gray-500 mt-0.5">
                사원 {g._count.members}명 · 연결 {g._count.forms}건
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/admin/groups/${g.id}`}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                구성원 편집
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(g.id, g.name, g._count.forms)}
                className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
              >
                <Trash2 className="w-4 h-4" /> 삭제
              </button>
            </div>
          </li>
        ))}
      </ul>

      {groups.length === 0 && !creating && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-8 text-center text-gray-600 text-sm">
          등록된 그룹이 없습니다. 「새 그룹」으로 첫 그룹을 만드세요.
        </div>
      )}
    </div>
  );
}

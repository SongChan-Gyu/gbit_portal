"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Save } from "lucide-react";

type MemberRow = {
  employeeId: string;
  employee: {
    id: string;
    name: string;
    empNo: string | null;
    employeeType: string;
    team: { name: string | null } | null;
  };
};

type PickerEmp = {
  id: string;
  name: string;
  empNo: string | null;
  employeeType: string;
  team: { name: string | null } | null;
};

export default function EmployeeGroupEditClient({
  groupId,
  initialName,
  initialMembers,
}: {
  groupId: string;
  initialName: string;
  initialMembers: MemberRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialMembers.map((m) => m.employeeId)),
  );
  const [employees, setEmployees] = useState<PickerEmp[] | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const res = await fetch("/api/admin/groups/picker-employees");
      if (res.ok && !cancel) setEmployees(await res.json());
    })();
    return () => {
      cancel = true;
    };
  }, []);

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

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const n = name.trim();
    if (n.length < 1) {
      setError("그룹 이름을 입력하세요.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/groups/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n, employeeIds: [...selectedIds] }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError((data as { error?: string }).error ?? "저장 실패");
      return;
    }
    router.push("/admin/groups");
    router.refresh();
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
      <div>
        <Link href="/admin/groups" className="text-sm text-gray-500 hover:text-gray-700">
          ← 그룹 설정
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">{error}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
        <div>
          <label className="label">그룹 이름</label>
          <input
            className="input w-full max-w-lg"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>

        <div>
          <label className="label">포함 사원 ({selectedIds.size}명)</label>
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
          <div className="max-h-[min(420px,50vh)] overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/50 p-2 space-y-1">
            {!employees ? (
              <p className="text-sm text-gray-500 py-6 text-center">사원 목록을 불러오는 중…</p>
            ) : (
              filteredEmployees.map((emp) => (
                <label
                  key={emp.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(emp.id)}
                    onChange={() => toggle(emp.id)}
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
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? "저장 중…" : "저장"}
        </button>
        <Link
          href="/admin/groups"
          className="px-5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 inline-flex items-center"
        >
          취소
        </Link>
      </div>
    </form>
  );
}

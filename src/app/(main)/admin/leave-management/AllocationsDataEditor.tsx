"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, ToggleLeft, ToggleRight, X, AlertTriangle } from "lucide-react";
import { formatYMD } from "@/lib/dateUtils";

interface Alloc {
  id: string;
  employeeId: string;
  sourceCode: string;
  label: string;
  totalDays: number;
  usedDays: number;
  validFrom: string;
  validUntil: string;
  fiscalYear: number | null;
  note: string | null;
  isActive: boolean;
  employee: { id: string; name: string; empNo: string };
}

interface Props {
  allocations: Alloc[];
  fiscalYear: number;
}

export default function AllocationsDataEditor({ allocations, fiscalYear }: Props) {
  const router = useRouter();
  const [editTarget, setEditTarget] = useState<Alloc | null>(null);
  const [form, setForm] = useState<Partial<Alloc>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const fyStart = `${fiscalYear}-05-01`;
  const fyEnd = `${fiscalYear + 1}-04-30`;

  function openEdit(a: Alloc) {
    setEditTarget(a);
    setForm({
      label: a.label,
      totalDays: a.totalDays,
      usedDays: a.usedDays,
      validFrom: a.validFrom.slice(0, 10),
      validUntil: a.validUntil.slice(0, 10),
      note: a.note ?? "",
      isActive: a.isActive,
    });
    setMsg(null);
  }

  async function save() {
    if (!editTarget) return;
    const total = form.totalDays ?? 0;
    const used = form.usedDays ?? 0;
    if (total - used < -0.001) {
      setMsg({
        type: "err",
        text: "잔여일수가 마이너스가 될 수 없습니다. 관련 승인 휴가를 먼저 취소한 후 수정해 주세요.",
      });
      return;
    }
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/admin/allocations/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: form.label,
        totalDays: form.totalDays,
        usedDays: form.usedDays,
        validFrom: form.validFrom,
        validUntil: form.validUntil,
        note: form.note || null,
        isActive: form.isActive,
        adminNote: "데이터 수정 탭에서 직접 수정",
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMsg({ type: "err", text: data.error ?? "저장 실패" });
      return;
    }
    setMsg({ type: "ok", text: "저장되었습니다." });
    setEditTarget(null);
    router.refresh();
  }

  async function toggleActive(a: Alloc) {
    const action = a.isActive ? "비활성화" : "재활성화";
    if (!confirm(`${a.employee.name} · ${a.label}을(를) ${action}하시겠습니까?`)) return;
    const res = await fetch(`/api/admin/allocations/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !a.isActive, adminNote: `관리자 ${action}` }),
    });
    if (res.ok) {
      setMsg({ type: "ok", text: `${action} 완료` });
      router.refresh();
    } else {
      const data = await res.json();
      setMsg({ type: "err", text: data.error ?? `${action} 실패` });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex gap-2">
        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
        <span>
          <strong>데이터 수정</strong>: 꼬였을 때 관리자가 부여/사용일수, 유효기간, 비고, 활성 여부를 직접 수정할 수 있습니다. 모든 변경은 감사 로그에 기록됩니다.
        </span>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border ${
            msg.type === "ok"
              ? "bg-green-50 text-green-700 border-green-100"
              : "bg-red-50 text-red-600 border-red-100"
          }`}
        >
          {msg.type === "err" && <AlertTriangle size={14} />}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto p-1 rounded hover:bg-black/10">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="data-table">
          <thead>
            <tr>
              <th className="whitespace-nowrap">직원</th>
              <th className="whitespace-nowrap">구분</th>
              <th className="whitespace-nowrap">부여</th>
              <th className="whitespace-nowrap">사용</th>
              <th className="whitespace-nowrap">잔여</th>
              <th className="whitespace-nowrap hidden md:table-cell">유효기간</th>
              <th className="whitespace-nowrap">활성</th>
              <th className="whitespace-nowrap">조작</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.id} className={!a.isActive ? "opacity-60 bg-gray-50" : ""}>
                <td className="font-medium whitespace-nowrap">
                  {a.employee.name}
                  <span className="ml-1 text-xs text-gray-400 hidden sm:inline">({a.employee.empNo})</span>
                </td>
                <td className="whitespace-nowrap">
                  <span className="font-medium">{a.label}</span>
                  <span className="ml-1 text-xs text-gray-400 hidden md:inline">{a.sourceCode}</span>
                </td>
                <td>{a.totalDays}</td>
                <td className="text-slate-600">{a.usedDays}</td>
                <td className="font-semibold text-slate-700">
                  {(a.totalDays - a.usedDays).toFixed(1)}
                </td>
                <td className="text-xs text-gray-500 whitespace-nowrap hidden md:table-cell">
                  {formatYMD(a.validFrom)} ~ {formatYMD(a.validUntil)}
                </td>
                <td>{a.isActive ? "활성" : "비활성"}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(a)}
                      className="text-xs text-blue-600 hover:underline inline-flex items-center gap-0.5"
                    >
                      <Pencil size={11} /> 수정
                    </button>
                    <button
                      onClick={() => toggleActive(a)}
                      className={`text-xs inline-flex items-center gap-0.5 ${
                        a.isActive ? "text-orange-600 hover:underline" : "text-teal-600 hover:underline"
                      }`}
                    >
                      {a.isActive ? (
                        <><ToggleLeft size={11} /> 비활성화</>
                      ) : (
                        <><ToggleRight size={11} /> 재활성화</>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {allocations.length === 0 && (
        <p className="text-center py-8 text-gray-500 text-sm">해당 연도 할당 데이터가 없습니다.</p>
      )}

      {/* 수정 모달 */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">할당 직접 수정</h2>
              <button
                onClick={() => setEditTarget(null)}
                className="p-1.5 rounded hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {editTarget.employee.name} · {editTarget.label}
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">표시명</label>
                <input
                  className="input"
                  value={form.label ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">부여 일수</label>
                  <input
                    type="number"
                    step="0.5"
                    className="input"
                    value={form.totalDays ?? 0}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, totalDays: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
                <div>
                  <label className="label">사용 일수</label>
                  <input
                    type="number"
                    step="0.5"
                    className="input"
                    value={form.usedDays ?? 0}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, usedDays: parseFloat(e.target.value) || 0 }))
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">유효 시작일</label>
                  <input
                    type="date"
                    className="input"
                    value={form.validFrom ?? fyStart}
                    onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">유효 종료일</label>
                  <input
                    type="date"
                    className="input"
                    value={form.validUntil ?? fyEnd}
                    onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="label">비고</label>
                <input
                  className="input"
                  value={form.note ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, note: e.target.value || null }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive !== false}
                  onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                />
                <label htmlFor="isActive" className="text-sm text-gray-700">
                  활성 (비활성 시 목록에서 제외·연차 합산 제외)
                </label>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditTarget(null)} className="btn-secondary flex-1">
                취소
              </button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

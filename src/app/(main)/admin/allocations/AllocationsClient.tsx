"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil, ToggleLeft, ToggleRight, AlertTriangle, X,
  CheckCircle, ArrowRightCircle, PlusCircle,
} from "lucide-react";
import { formatYMD } from "@/lib/dateUtils";

interface Emp { id: string; name: string; empNo: string; team: { name: string } | null; }
interface Alloc {
  id: string; employeeId: string; sourceCode: string; label: string;
  totalDays: number; usedDays: number;
  validFrom: string; validUntil: string;
  fiscalYear: number | null; note: string | null; isActive: boolean;
  employee: { name: string; empNo: string };
}

interface Props {
  employees: Emp[];
  initialAllocations: Alloc[];
  selectedEmpId: string;
  currentFy: number;
}

/** 만료 여부 */
function isExpired(validUntil: string) {
  return new Date(validUntil) < new Date();
}

export default function AllocationsClient({ employees, initialAllocations, selectedEmpId, currentFy }: Props) {
  const router = useRouter();
  const [empId, setEmpId]       = useState(selectedEmpId);
  const [allocs, setAllocs]     = useState<Alloc[]>(initialAllocations);
  const [loading, setLoading]   = useState(false);
  const [editTarget, setEditTarget] = useState<Alloc | null>(null);
  const [form, setForm] = useState<Partial<Alloc & { adminNote: string }>>({});
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 이월 처리 상태
  const [carryoverSource, setCarryoverSource] = useState<Alloc | null>(null);
  const [carryoverForm, setCarryoverForm] = useState({
    days: 0,
    targetFy: currentFy + 1,
    note: "",
  });
  const [carryoverSaving, setCarryoverSaving] = useState(false);

  async function loadEmployee(id: string) {
    if (!id) { setAllocs([]); return; }
    setLoading(true);
    const res  = await fetch(`/api/admin/allocations?empId=${id}`);
    const data = await res.json();
    setAllocs(data.allocations ?? []);
    setLoading(false);
    router.replace(`?tab=allocations&empId=${id}`, { scroll: false });
  }

  function openEdit(a: Alloc) {
    setEditTarget(a);
    setForm({ ...a, adminNote: "" });
    setMsg(null);
  }

  function openCarryover(a: Alloc) {
    const remaining = a.totalDays - a.usedDays;
    setCarryoverSource(a);
    setCarryoverForm({
      days: remaining > 0 ? remaining : 0,
      targetFy: (a.fiscalYear ?? currentFy) + 1,
      note: `${a.fiscalYear ?? currentFy} → ${(a.fiscalYear ?? currentFy) + 1} 이월 처리`,
    });
    setMsg(null);
  }

  async function save() {
    if (!editTarget) return;
    setSaving(true); setMsg(null);
    const res = await fetch(`/api/admin/allocations/${editTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setMsg({ type: "err", text: data.error ?? "저장 실패" }); return; }
    setMsg({ type: "ok", text: "저장되었습니다." });
    setEditTarget(null);
    setAllocs(prev => prev.map(a => a.id === editTarget.id ? { ...a, ...form } as Alloc : a));
  }

  async function saveCarryover() {
    if (!carryoverSource) return;
    if (carryoverForm.days <= 0) { setMsg({ type: "err", text: "이월할 일수를 입력하세요." }); return; }
    if (!carryoverForm.note.trim()) { setMsg({ type: "err", text: "이월 사유를 입력하세요." }); return; }

    const remaining = carryoverSource.totalDays - carryoverSource.usedDays;
    if (carryoverForm.days > remaining) {
      setMsg({ type: "err", text: `이월 가능 일수(${remaining}일)를 초과합니다.` }); return;
    }

    setCarryoverSaving(true); setMsg(null);

    // 1. 기존 할당 잔여를 0으로 비활성화
    await fetch(`/api/admin/allocations/${carryoverSource.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isActive: false,
        adminNote: `이월 처리로 비활성화 (${carryoverForm.days}일 이월)`,
      }),
    });

    // 2. 다음 귀속연도 CARRYOVER 할당 생성
    const fy = carryoverForm.targetFy;
    const fyStart = new Date(`${fy}-05-01`).toISOString();
    const fyEnd   = new Date(`${fy + 1}-04-30`).toISOString();

    const res = await fetch("/api/admin/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: carryoverSource.employeeId,
        sourceCode: "CARRYOVER",
        label: `이월연차(${carryoverSource.fiscalYear ?? currentFy}→${fy})`,
        totalDays: carryoverForm.days,
        validFrom: fyStart,
        validUntil: fyEnd,
        fiscalYear: fy,
        note: carryoverForm.note,
        adminNote: carryoverForm.note,
      }),
    });

    const data = await res.json();
    setCarryoverSaving(false);

    if (!res.ok) { setMsg({ type: "err", text: data.error ?? "이월 처리 실패" }); return; }

    setMsg({ type: "ok", text: `이월 처리 완료: ${carryoverForm.days}일 → FY${fy}` });
    setCarryoverSource(null);
    await loadEmployee(empId);
  }

  async function toggleActive(a: Alloc) {
    const action = a.isActive ? "비활성화" : "복구";
    if (!confirm(`${a.label}을(를) ${action}하시겠습니까?\n모든 변경은 감사 로그에 기록됩니다.`)) return;
    const res = await fetch(`/api/admin/allocations/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !a.isActive, adminNote: `관리자 ${action}` }),
    });
    if (res.ok) {
      setAllocs(prev => prev.map(al => al.id === a.id ? { ...al, isActive: !a.isActive } : al));
      setMsg({ type: "ok", text: `${action} 완료` });
    } else {
      const data = await res.json();
      setMsg({ type: "err", text: data.error ?? `${action} 실패` });
    }
  }

  const active   = allocs.filter(a =>  a.isActive);
  const inactive = allocs.filter(a => !a.isActive);

  /** 이월 가능한 할당: BASE_ANNUAL 또는 CARRYOVER 중 잔여>0이고 만료 임박한 것 */
  const carryoverCandidates = active.filter(a =>
    ["BASE_ANNUAL", "CARRYOVER", "TENURE_BONUS", "DEPT_BONUS"].includes(a.sourceCode) &&
    a.totalDays - a.usedDays > 0
  );

  return (
    <div className="space-y-4">
      {/* 직원 선택 */}
      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="label">직원 선택</label>
          <select className="input" value={empId}
            onChange={e => { setEmpId(e.target.value); loadEmployee(e.target.value); }}>
            <option value="">-- 직원을 선택하세요 --</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.team?.name ?? "-"} · {e.name} ({e.empNo})</option>
            ))}
          </select>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border ${
          msg.type === "ok"
            ? "bg-green-50 text-green-700 border-green-100"
            : "bg-red-50 text-red-600 border-red-100"
        }`}>
          {msg.type === "ok" ? <CheckCircle size={14}/> : <AlertTriangle size={14}/>}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto"><X size={13}/></button>
        </div>
      )}

      {/* 이월 처리 안내 배너 */}
      {empId && carryoverCandidates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
          <p className="font-semibold mb-1">이월 처리 안내</p>
          <p>연차는 <strong>귀속연도 만료 시 자동 소멸</strong>됩니다. 이월이 필요한 경우 관리자가 수동으로 처리해야 합니다.</p>
          <p className="mt-1 text-amber-600">이월 가능 할당: {carryoverCandidates.map(a => `${a.label} ${(a.totalDays-a.usedDays).toFixed(1)}일`).join(", ")}</p>
        </div>
      )}

      {!empId ? (
        <div className="text-center py-12 text-sm text-gray-400 border border-dashed border-gray-300 rounded-xl">
          직원을 선택하면 할당 목록이 표시됩니다
        </div>
      ) : loading ? (
        <div className="text-center py-12 text-sm text-gray-400">불러오는 중...</div>
      ) : allocs.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">할당 데이터 없음</div>
      ) : (
        <div className="space-y-3">
          {/* 활성 할당 */}
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-600">
              활성 할당 {active.length}건
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2.5 text-left">구분</th>
                  <th className="px-4 py-2.5 text-center">귀속연도</th>
                  <th className="px-4 py-2.5 text-right">부여</th>
                  <th className="px-4 py-2.5 text-right">사용</th>
                  <th className="px-4 py-2.5 text-right font-semibold">잔여</th>
                  <th className="px-4 py-2.5 text-left hidden md:table-cell">유효기간</th>
                  <th className="px-4 py-2.5 text-center">조작</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {active.map(a => {
                  const expired = isExpired(a.validUntil);
                  const remaining = a.totalDays - a.usedDays;
                  return (
                    <tr key={a.id} className={`hover:bg-gray-50 ${expired ? "opacity-60" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 text-[13px]">{a.label}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{a.sourceCode}</p>
                        {expired && <span className="text-[10px] text-red-500 font-semibold">만료됨</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">{a.fiscalYear ?? "-"}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">{a.totalDays}</td>
                      <td className="px-4 py-3 text-right text-red-500">{a.usedDays}</td>
                      <td className={`px-4 py-3 text-right font-bold ${remaining > 0 && !expired ? "text-blue-700" : "text-gray-400"}`}>
                        {remaining.toFixed(1)}
                      </td>
                  <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell whitespace-nowrap">
                        {formatYMD(a.validFrom)} ~ {formatYMD(a.validUntil)}
                        {expired && <span className="ml-1 text-red-400">(만료)</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <button onClick={() => openEdit(a)}
                            className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
                            <Pencil size={11}/> 수정
                          </button>
                          {/* 이월 버튼: 기본연차/이월연차/근속가산/부서추가 중 잔여>0이고 만료 안됨 */}
                          {["BASE_ANNUAL","CARRYOVER","TENURE_BONUS","DEPT_BONUS"].includes(a.sourceCode) && remaining > 0 && !expired && (
                            <button onClick={() => openCarryover(a)}
                              className="inline-flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-800 px-2 py-1 rounded hover:bg-teal-50">
                              <ArrowRightCircle size={11}/> 이월
                            </button>
                          )}
                          <button onClick={() => toggleActive(a)}
                            className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:text-orange-800 px-2 py-1 rounded hover:bg-orange-50">
                            <ToggleLeft size={11}/> 비활성화
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 비활성 */}
          {inactive.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden bg-white opacity-60">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-500">
                비활성 할당 {inactive.length}건 (만료·이월·비활성)
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {inactive.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-600 text-[13px]">{a.label}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{a.sourceCode}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-400">{a.fiscalYear ?? "-"}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{a.totalDays}일</td>
                      <td className="px-4 py-3 text-right text-gray-400">{a.usedDays}일 사용</td>
                      <td className="px-4 py-3 text-right text-gray-400">{(a.totalDays - a.usedDays).toFixed(1)}일</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleActive(a)}
                          className="inline-flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-800 px-2 py-1 rounded hover:bg-teal-50">
                          <ToggleRight size={11}/> 복구
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 수정 모달 */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h2 className="font-bold text-gray-800">할당 수정 — {editTarget.label}</h2>
              <button onClick={() => setEditTarget(null)} className="p-1.5 rounded hover:bg-gray-100"><X size={15}/></button>
            </div>
            <div className="p-6 space-y-3">
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700 flex gap-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                <span>모든 수정은 감사 로그에 기록됩니다.</span>
              </div>
              {[
                ["label",    "표시명",      "text"],
                ["totalDays","부여 일수",   "number"],
                ["usedDays", "사용 일수",   "number"],
                ["validFrom","유효기간 시작","date"],
                ["validUntil","유효기간 종료","date"],
              ].map(([k, l, t]) => (
                <div key={k}>
                  <label className="label">{l}</label>
                  <input type={t} step={t === "number" ? "0.5" : undefined}
                    className="input"
                    value={t === "date" ? String(form[k as keyof typeof form] ?? "").slice(0, 10) : (form[k as keyof typeof form] as string) ?? ""}
                    onChange={e => setForm(p => ({ ...p, [k]: t === "number" ? parseFloat(e.target.value) : e.target.value }))} />
                </div>
              ))}
              <div>
                <label className="label">수정 사유 (필수)</label>
                <input className="input" placeholder="ex: 오류 수정, 수기 조정 등"
                  value={form.adminNote ?? ""}
                  onChange={e => setForm(p => ({ ...p, adminNote: e.target.value }))} />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setEditTarget(null)} className="btn-secondary flex-1">취소</button>
              <button onClick={save} disabled={saving || !form.adminNote?.trim()}
                className="btn-primary flex-1 disabled:opacity-60">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이월 처리 모달 */}
      {carryoverSource && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <div className="flex items-center gap-2">
                <ArrowRightCircle size={18} className="text-teal-600"/>
                <h2 className="font-bold text-gray-800">이월 처리</h2>
              </div>
              <button onClick={() => setCarryoverSource(null)} className="p-1.5 rounded hover:bg-gray-100"><X size={15}/></button>
            </div>
            <div className="p-6 space-y-4">
              {/* 원본 할당 정보 */}
              <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">원본 할당</span>
                  <span className="font-semibold text-gray-800">{carryoverSource.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">귀속연도</span>
                  <span>{carryoverSource.fiscalYear ?? "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">잔여 일수</span>
                  <span className="font-bold text-blue-700">{(carryoverSource.totalDays - carryoverSource.usedDays).toFixed(1)}일</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">만료일</span>
                  <span>{formatYMD(carryoverSource.validUntil)}</span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 flex gap-2">
                <AlertTriangle size={13} className="shrink-0 mt-0.5"/>
                <span>
                  원본 할당은 <strong>비활성화</strong>되고, 지정 귀속연도에 <strong>이월연차</strong>가 새로 생성됩니다.
                  연차는 귀속연도 만료 시 자동 소멸이 원칙이므로, <strong>이월은 관리자가 수동으로 승인한 경우에만</strong> 처리하세요.
                </span>
              </div>

              <div>
                <label className="label">이월할 일수</label>
                <input type="number" step="0.5" min="0.5"
                  max={carryoverSource.totalDays - carryoverSource.usedDays}
                  className="input"
                  value={carryoverForm.days}
                  onChange={e => setCarryoverForm(p => ({ ...p, days: parseFloat(e.target.value) || 0 }))} />
                <p className="text-xs text-gray-400 mt-1">
                  최대 {(carryoverSource.totalDays - carryoverSource.usedDays).toFixed(1)}일
                </p>
              </div>

              <div>
                <label className="label">이월 대상 귀속연도</label>
                <select className="input"
                  value={carryoverForm.targetFy}
                  onChange={e => setCarryoverForm(p => ({ ...p, targetFy: parseInt(e.target.value) }))}>
                  {[currentFy, currentFy + 1, currentFy + 2].map(fy => (
                    <option key={fy} value={fy}>FY{fy} ({fy}년 5월 ~ {fy+1}년 4월)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">이월 사유 (필수)</label>
                <input className="input" placeholder="ex: 회사 사정으로 인한 이월 승인"
                  value={carryoverForm.note}
                  onChange={e => setCarryoverForm(p => ({ ...p, note: e.target.value }))} />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setCarryoverSource(null)} className="btn-secondary flex-1">취소</button>
              <button onClick={saveCarryover}
                disabled={carryoverSaving || carryoverForm.days <= 0 || !carryoverForm.note.trim()}
                className="flex-1 py-2 px-4 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 transition-colors">
                {carryoverSaving ? "처리 중..." : <><PlusCircle size={14} className="inline mr-1"/>이월 처리</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

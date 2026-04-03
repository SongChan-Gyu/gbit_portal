"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, PlusCircle, Pencil, ArrowRightCircle, ToggleLeft, ToggleRight, X, AlertTriangle } from "lucide-react";
import { formatYMD } from "@/lib/dateUtils";
import { formatLeaveDayDisplay } from "@/lib/leaveOverviewTable";

interface Alloc {
  id:string; sourceCode:string; label:string; totalDays:number; usedDays:number;
  validFrom:string; validUntil:string; note:string|null; isActive?:boolean; fiscalYear?:number|null;
}
interface Emp { id:string; name:string; empNo:string; position:string; team:{ name:string }|null; leaveAllocations:Alloc[]; }
interface SourceOption { value: string; label: string; }

function fyDates(fy: number) {
  return { from:`${fy}-05-01`, until:`${fy+1}-04-30` };
}

export default function FiscalYearManager({
  employees,
  fiscalYear,
  sourceOptions,
}: {
  employees:Emp[];
  fiscalYear:number;
  sourceOptions: SourceOption[];
}) {
  const router = useRouter();
  const [grantModal, setGrantModal] = useState<{ emp:Emp; alloc?:Alloc } | null>(null);
  const [form, setForm] = useState<Partial<Alloc & { isNew:boolean }>>({});
  const [initialForm, setInitialForm] = useState<Partial<Alloc & { isNew:boolean }>>({});
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const [initializing, setInitializing] = useState(false);
  const [initResult, setInitResult]     = useState<string>("");
  const [carryoverSource, setCarryoverSource] = useState<{ emp: Emp; alloc: Alloc } | null>(null);
  const [carryoverForm, setCarryoverForm] = useState({
    days: 0,
    targetFy: fiscalYear + 1,
    note: "",
  });
  const [carryoverSaving, setCarryoverSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [initPreviewMatrix, setInitPreviewMatrix] = useState<{
    columns: { key: string; label: string }[];
    rows: { employeeId: string; name: string; values: Record<string, number | null> }[];
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const fyD = fyDates(fiscalYear);

  async function loadInitPreview() {
    setLoadingPreview(true);
    setInitPreviewMatrix(null);
    setInitResult("");
    const res = await fetch("/api/admin/fiscal-year/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fy: fiscalYear, dryRun: true }),
    });
    const data = await res.json();
    setLoadingPreview(false);
    if (!res.ok) { setInitResult("❌ 미리보기 실패: " + (data.error ?? "")); return; }
    const matrix = data.previewMatrix as {
      columns: { key: string; label: string }[];
      rows: { employeeId: string; name: string; values: Record<string, number | null> }[];
    } | null;
    setInitPreviewMatrix(matrix && matrix.rows?.length ? matrix : null);
    if (!matrix?.rows?.length) setInitResult("추가될 할당이 없습니다. (이미 모두 존재)");
  }

  async function runInit() {
    const cellCount =
      initPreviewMatrix?.rows.reduce(
        (s, r) => s + initPreviewMatrix.columns.filter((c) => r.values[c.key] != null).length,
        0,
      ) ?? 0;
    if (!initPreviewMatrix?.rows?.length && !confirm(`${fiscalYear}년도 귀속연도를 일괄 초기화하시겠습니까?`)) return;
    if (initPreviewMatrix?.rows?.length && !confirm(`미리보기대로 ${cellCount}건 할당을 생성하시겠습니까?`)) return;
    setInitializing(true);
    setInitResult("");
    const res = await fetch("/api/admin/fiscal-year/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fy: fiscalYear }),
    });
    const data = await res.json();
    setInitializing(false);
    if (!res.ok) { setInitResult("❌ " + (data.error ?? "실패")); return; }
    setInitResult(`✅ 완료: ${data.summary.created}건 생성, ${data.summary.skipped}건 이미 존재 (총 ${data.total}명)`);
    setInitPreviewMatrix(null);
    router.refresh();
  }

  function openGrant(emp: Emp, alloc?: Alloc) {
    setGrantModal({ emp, alloc });
    const defaultSource = sourceOptions[0]?.value ?? "BASE_ANNUAL";
    const defaultLabel = sourceOptions[0]?.label ?? "기본연차";
    const initial = alloc ? { ...alloc, isNew: false as boolean } : {
      sourceCode: defaultSource, label: defaultLabel, totalDays: 15, usedDays: 0,
      validFrom: fyD.from, validUntil: fyD.until, note: null, isNew: true as boolean,
    };
    setForm(initial);
    setInitialForm(JSON.parse(JSON.stringify(initial)));
    setErr("");
  }

  function isFieldChanged(key: keyof Alloc): boolean {
    let a = initialForm[key];
    let b = form[key];
    if (key === "validFrom" || key === "validUntil") {
      a = typeof a === "string" ? a.slice(0, 10) : a;
      b = typeof b === "string" ? (b as string).slice(0, 10) : b;
    }
    if (a === undefined && b === undefined) return false;
    if (a === b) return false;
    if (typeof a === "number" && typeof b === "number") return a !== b;
    return String(a ?? "") !== String(b ?? "");
  }

  async function saveGrant() {
    if (
      !grantModal ||
      !form.sourceCode ||
      !form.label ||
      form.totalDays == null ||
      form.usedDays == null ||
      !form.validFrom ||
      !form.validUntil
    ) {
      setErr("필수 항목을 입력하세요."); return;
    }
    if (Number.isNaN(Number(form.totalDays)) || Number.isNaN(Number(form.usedDays))) {
      setErr("부여일수/사용일수는 숫자여야 합니다."); return;
    }
    setSaving(true); setErr("");
    const isNew = !grantModal.alloc;
    const url  = isNew ? "/api/admin/allocations" : `/api/admin/allocations/${grantModal.alloc!.id}`;
    const method = isNew ? "POST" : "PATCH";
    const res = await fetch(url, {
      method, headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ ...form, employeeId:grantModal.emp.id, fiscalYear }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    setGrantModal(null);
    router.refresh();
  }

  function openCarryover(emp: Emp, alloc: Alloc) {
    const remaining = alloc.totalDays - alloc.usedDays;
    setCarryoverSource({ emp, alloc });
    setCarryoverForm({
      days: remaining > 0 ? remaining : 0,
      targetFy: (alloc.fiscalYear ?? fiscalYear) + 1,
      note: `${alloc.fiscalYear ?? fiscalYear} → ${(alloc.fiscalYear ?? fiscalYear) + 1} 이월 처리`,
    });
    setMsg(null);
  }

  async function saveCarryover() {
    if (!carryoverSource) return;
    const { emp, alloc } = carryoverSource;
    if (carryoverForm.days <= 0) { setMsg({ type: "err", text: "이월할 일수를 입력하세요." }); return; }
    if (!carryoverForm.note.trim()) { setMsg({ type: "err", text: "이월 사유를 입력하세요." }); return; }
    const remaining = alloc.totalDays - alloc.usedDays;
    if (carryoverForm.days > remaining) {
      setMsg({ type: "err", text: `이월 가능 일수(${remaining}일)를 초과합니다.` }); return;
    }
    setCarryoverSaving(true); setMsg(null);
    await fetch(`/api/admin/allocations/${alloc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isActive: false,
        adminNote: `이월 처리로 비활성화 (${carryoverForm.days}일 이월)`,
      }),
    });
    const fy = carryoverForm.targetFy;
    const fyStart = new Date(`${fy}-05-01`).toISOString();
    const fyEnd   = new Date(`${fy + 1}-04-30`).toISOString();
    const res = await fetch("/api/admin/allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: emp.id,
        sourceCode: "CARRYOVER",
        label: `이월연차(${alloc.fiscalYear ?? fiscalYear}→${fy})`,
        totalDays: carryoverForm.days,
        validFrom: fyStart,
        validUntil: fyEnd,
        fiscalYear: fy,
        note: carryoverForm.note,
      }),
    });
    const data = await res.json();
    setCarryoverSaving(false);
    if (!res.ok) { setMsg({ type: "err", text: data.error ?? "이월 처리 실패" }); return; }
    setMsg({ type: "ok", text: `이월 처리 완료: ${carryoverForm.days}일 → FY${fy}` });
    setCarryoverSource(null);
    router.refresh();
  }

  async function toggleActive(emp: Emp, alloc: Alloc) {
    const action = alloc.isActive !== false ? "비활성화" : "복구";
    if (!confirm(`${alloc.label}을(를) ${action}하시겠습니까?`)) return;
    const res = await fetch(`/api/admin/allocations/${alloc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: alloc.isActive === false, adminNote: `관리자 ${action}` }),
    });
    if (res.ok) router.refresh();
    else {
      const data = await res.json();
      setMsg({ type: "err", text: data.error ?? `${action} 실패` });
    }
  }

  return (
    <div className="space-y-4">
      {/* 상단 정보 + 미리보기 / 저장 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
        <span>귀속연도 <strong>{fiscalYear}년도</strong> ({fyD.from} ~ {fyD.until}) — 재직자 {employees.length}명</span>
        <div className="flex items-center gap-2">
          <button onClick={loadInitPreview} disabled={loadingPreview}
            className="flex items-center gap-1.5 bg-white border border-blue-300 text-blue-700 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-60 transition">
            {loadingPreview ? "조회 중..." : "미리보기"}
          </button>
          <button onClick={runInit} disabled={initializing}
            className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            <Zap size={13}/>
            {initializing ? "저장 중..." : "저장(적용)"}
          </button>
        </div>
      </div>
      {/* 미리보기: 행=사원, 열=AllocationSourceConfig 등 메타 부여 소스 */}
      {initPreviewMatrix && initPreviewMatrix.rows.length > 0 && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50/50 p-4">
          <p className="text-sm font-semibold text-red-800 mb-2">
            저장 시 추가될 부여 일수 — 행: 사원, 열: 부여 소스(시스템 메타 순서)
          </p>
          <p className="text-xs text-red-700/90 mb-2">
            월별 적립(입사 1년 미만)은 귀속연도 초기화에 포함되지 않으며, 스케줄러만 부여합니다. 유효기간은 부여월 1일~해당 귀속연도 말일(4/30)입니다.
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border border-red-200">
            <table className="w-max min-w-full text-sm border-collapse bg-white/80">
              <thead className="bg-red-100 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-red-800 whitespace-nowrap border-b border-red-200 sticky left-0 bg-red-100">
                    사원
                  </th>
                  {initPreviewMatrix.columns.map((c) => (
                    <th
                      key={c.key}
                      className="text-right px-2 py-2 text-[11px] font-semibold text-red-800 whitespace-nowrap border-b border-red-200 max-w-[7rem]"
                      title={c.label}
                    >
                      <span className="line-clamp-2">{c.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-red-100">
                {initPreviewMatrix.rows.map((r) => (
                  <tr key={r.employeeId}>
                    <td className="px-3 py-2 text-red-900 font-medium whitespace-nowrap sticky left-0 bg-white border-r border-red-100">
                      {r.name}
                    </td>
                    {initPreviewMatrix.columns.map((c) => {
                      const v = r.values[c.key];
                      return (
                        <td
                          key={c.key}
                          className={`px-2 py-2 text-right tabular-nums text-xs ${
                            v != null ? "text-red-900 font-semibold bg-red-50/80" : "text-gray-300"
                          }`}
                        >
                          {v != null ? `${formatLeaveDayDisplay(Number(v))}일` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-red-600 mt-2">
            총{" "}
            {initPreviewMatrix.rows.reduce(
              (s, row) => s + initPreviewMatrix.columns.filter((c) => row.values[c.key] != null).length,
              0,
            )}
            건 생성 예정 · 저장(적용)으로 반영
          </p>
        </div>
      )}
      {initResult && (
        <div className={`text-sm px-4 py-2 rounded-lg ${initResult.startsWith("✅")?"bg-green-50 text-green-700":"bg-red-50 text-red-600"}`}>
          {initResult}
        </div>
      )}
      {msg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-lg border ${
          msg.type === "ok" ? "bg-green-50 text-green-700 border-green-100" : "bg-red-50 text-red-600 border-red-100"
        }`}>
          {msg.type === "ok" ? null : <AlertTriangle size={14}/>}
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto p-1 rounded hover:bg-black/10"><X size={13}/></button>
        </div>
      )}

      {employees.map((emp) => {
        const activeAllocs = emp.leaveAllocations.filter((a) => a.isActive !== false);
        const total = activeAllocs.reduce((s,a)=>s+a.totalDays,0);
        const used  = activeAllocs.reduce((s,a)=>s+a.usedDays,0);
        const isMonthlyAccrualRow = (a: Alloc) => {
          if (a.sourceCode.startsWith("MONTHLY_ACCRUAL_")) return true;
          const n = a.note ?? "";
          if (a.sourceCode !== "BASE_ANNUAL") return false;
          return n.includes("MONTHLY_ACCRUAL_POOL") || n.includes("MONTHLY_ACCRUAL:");
        };
        const monthlyAccrualRows = emp.leaveAllocations.filter(isMonthlyAccrualRow);
        const displayAllocs =
          monthlyAccrualRows.length >= 2
            ? [
                ...emp.leaveAllocations.filter((a) => !isMonthlyAccrualRow(a)),
                {
                  ...monthlyAccrualRows[0],
                  id: `monthly-agg-${emp.id}`,
                  label: "기본연차(월별적립 묶음)",
                  totalDays: monthlyAccrualRows.reduce((s, a) => s + a.totalDays, 0),
                  usedDays: monthlyAccrualRows.reduce((s, a) => s + a.usedDays, 0),
                  note: `${monthlyAccrualRows.length}건 통합 표시`,
                  validFrom: monthlyAccrualRows.reduce(
                    (min, a) => new Date(a.validFrom) < new Date(min) ? a.validFrom : min,
                    monthlyAccrualRows[0].validFrom,
                  ),
                  validUntil: monthlyAccrualRows.reduce(
                    (max, a) => new Date(a.validUntil) > new Date(max) ? a.validUntil : max,
                    monthlyAccrualRows[0].validUntil,
                  ),
                } as Alloc,
              ]
            : emp.leaveAllocations;
        return (
          <div key={emp.id} className="card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="font-semibold text-gray-800">{emp.name}</span>
                <span className="ml-2 text-xs text-gray-500">{emp.team?.name} · {emp.position}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  <span className="font-bold text-blue-600">{(total-used).toFixed(1)}</span>/{total}일 잔여
                </span>
                <button onClick={() => openGrant(emp)}
                  className="btn-primary text-xs py-1.5 px-3">+ 할당추가</button>
              </div>
            </div>

            {displayAllocs.length === 0 ? (
              <p className="text-xs text-gray-400">할당 없음</p>
            ) : (
              <div className="space-y-2">
                {displayAllocs.map((a) => {
                  const active = a.isActive !== false;
                  const remaining = a.totalDays - a.usedDays;
                  const isSyntheticMonthlyAgg = a.id.startsWith("monthly-agg-");
                  const canCarryover = active && remaining > 0 &&
                    ["BASE_ANNUAL","CARRYOVER","TENURE_BONUS","DEPT_BONUS"].includes(a.sourceCode);
                  return (
                    <div key={a.id} className={`flex items-center justify-between py-1.5 px-3 rounded-lg text-sm ${active ? "bg-gray-50" : "bg-gray-100 opacity-70"}`}>
                      <div>
                        <span className="font-medium">{a.label}</span>
                        {!active && <span className="ml-1.5 text-xs text-orange-600">(비활성)</span>}
                        {a.note && <span className="ml-2 text-xs text-gray-400">({a.note})</span>}
                        <span className="ml-2 text-xs text-gray-500">
                          {formatYMD(a.validFrom)} ~ {formatYMD(a.validUntil)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-600">{(a.totalDays-a.usedDays)}/{a.totalDays}일</span>
                        <button onClick={() => openGrant(emp, a)}
                          disabled={isSyntheticMonthlyAgg}
                          className="text-xs text-blue-500 hover:underline">수정</button>
                        {canCarryover && (
                          <button onClick={() => openCarryover(emp, a)}
                            disabled={isSyntheticMonthlyAgg}
                            className="text-xs text-teal-600 hover:underline inline-flex items-center gap-0.5">
                            <ArrowRightCircle size={11}/> 이월
                          </button>
                        )}
                        <button onClick={() => toggleActive(emp, a)}
                          disabled={isSyntheticMonthlyAgg}
                          className={`text-xs inline-flex items-center gap-0.5 ${active ? "text-orange-600 hover:underline" : "text-teal-600 hover:underline"}`}>
                          {active ? <><ToggleLeft size={11}/> 비활성화</> : <><ToggleRight size={11}/> 재활성화</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {grantModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-1">
              {grantModal.alloc ? "할당 수정" : "연차 할당 추가"}
            </h2>
            <p className="text-sm text-gray-500 mb-4">{grantModal.emp.name} · {fiscalYear}년도</p>

            <div className="space-y-3">
              <div>
                <label className="label">분류</label>
                <select className={`input ${isFieldChanged("sourceCode") ? "border-red-500 bg-red-50" : ""}`} value={form.sourceCode??""} onChange={(e)=>setForm((p)=>({...p,sourceCode:e.target.value}))}>
                  {sourceOptions.map((opt)=><option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">표시명 *</label>
                <input className={`input ${isFieldChanged("label") ? "border-red-500 bg-red-50" : ""}`} value={form.label??""} onChange={(e)=>setForm((p)=>({...p,label:e.target.value}))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">부여일수 *</label>
                  <input type="number" step="0.5" className={`input ${isFieldChanged("totalDays") ? "border-red-500 bg-red-50" : ""}`} value={form.totalDays??0}
                    onChange={(e)=>setForm((p)=>({...p,totalDays:e.target.value === "" ? 0 : parseFloat(e.target.value)}))} />
                </div>
                <div>
                  <label className="label">사용일수</label>
                  <input type="number" step="0.5" className={`input ${isFieldChanged("usedDays") ? "border-red-500 bg-red-50" : ""}`} value={form.usedDays??0}
                    onChange={(e)=>setForm((p)=>({...p,usedDays:e.target.value === "" ? 0 : parseFloat(e.target.value)}))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">유효 시작일</label>
                  <input type="date" className={`input ${isFieldChanged("validFrom") ? "border-red-500 bg-red-50" : ""}`} value={form.validFrom?.slice(0,10)??fyD.from}
                    onChange={(e)=>setForm((p)=>({...p,validFrom:e.target.value}))} />
                </div>
                <div>
                  <label className="label">유효 종료일</label>
                  <input type="date" className={`input ${isFieldChanged("validUntil") ? "border-red-500 bg-red-50" : ""}`} value={form.validUntil?.slice(0,10)??fyD.until}
                    onChange={(e)=>setForm((p)=>({...p,validUntil:e.target.value}))} />
                </div>
              </div>
              <div>
                <label className="label">비고</label>
                <input className={`input ${isFieldChanged("note") ? "border-red-500 bg-red-50" : ""}`} value={form.note??""} onChange={(e)=>setForm((p)=>({...p,note:e.target.value||null}))} />
              </div>
            </div>

            {err && <p className="text-sm text-red-500 mt-3">{err}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={()=>setGrantModal(null)} className="btn-secondary flex-1">취소</button>
              <button onClick={saveGrant} disabled={saving} className="btn-primary flex-1">
                {saving?"저장 중...":"저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이월 처리 모달 */}
      {carryoverSource && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <ArrowRightCircle size={18} className="text-teal-600"/> 이월 처리
              </h2>
              <button onClick={() => setCarryoverSource(null)} className="p-1.5 rounded hover:bg-gray-100"><X size={16}/></button>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs space-y-1 mb-4">
              <div className="flex justify-between"><span className="text-gray-500">원본</span><span className="font-semibold">{carryoverSource.alloc.label}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">잔여</span><span className="font-bold text-blue-700">{(carryoverSource.alloc.totalDays - carryoverSource.alloc.usedDays).toFixed(1)}일</span></div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">이월할 일수</label>
                <input type="number" step="0.5" min="0.5" max={carryoverSource.alloc.totalDays - carryoverSource.alloc.usedDays}
                  className="input" value={carryoverForm.days}
                  onChange={(e)=>setCarryoverForm((p)=>({...p, days: parseFloat(e.target.value) || 0}))} />
              </div>
              <div>
                <label className="label">이월 대상 귀속연도</label>
                <select className="input" value={carryoverForm.targetFy}
                  onChange={(e)=>setCarryoverForm((p)=>({...p, targetFy: parseInt(e.target.value)}))}>
                  {[fiscalYear, fiscalYear+1, fiscalYear+2].map((y)=>(<option key={y} value={y}>FY{y}</option>))}
                </select>
              </div>
              <div>
                <label className="label">이월 사유 (필수)</label>
                <input className="input" value={carryoverForm.note}
                  onChange={(e)=>setCarryoverForm((p)=>({...p, note: e.target.value}))} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={()=>setCarryoverSource(null)} className="btn-secondary flex-1">취소</button>
              <button onClick={saveCarryover} disabled={carryoverSaving || carryoverForm.days <= 0 || !carryoverForm.note.trim()}
                className="flex-1 py-2 px-4 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-60">
                {carryoverSaving ? "처리 중..." : "이월 처리"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

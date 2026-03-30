"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Pencil, ToggleLeft, ToggleRight, X, ChevronDown } from "lucide-react";

interface LT {
  id:string; code:string; name:string; daysPerUnit:number; deductFromBalance:boolean;
  approvalSteps:number; maxPerMonth:number|null; maxPerYear:number|null;
  requiresStamp:boolean; stampCount:number|null; isHalf:boolean;
  isAmOnly:boolean; isPmOnly:boolean;
  allowsFullDay:boolean; allowsHalfDay:boolean; halfDayAmPm:string;
  applyGroupKey:string|null;
  validityBasis:string; validityMonths:number|null;
  isActive:boolean; sortOrder:number; color:string;
  /** LeaveAllocation.sourceCode 와 동일하면 그 부여 풀에서만 차감 */
  allocationSourceCode:string|null;
}

const VALIDITY_OPTIONS = [
  { value:"귀속연도",   label:"귀속연도 기준 (매년 5월 초기화)" },
  { value:"입사일기준", label:"입사일 기준 (N주년 발생)" },
  { value:"부여일기준", label:"부여일 기준 (부여 후 N개월)" },
];

const VALIDITY_BADGE: Record<string, { bg:string; text:string; label:string }> = {
  "귀속연도":   { bg:"bg-blue-50",   text:"text-blue-700",  label:"귀속연도" },
  "입사일기준": { bg:"bg-violet-50", text:"text-violet-700",label:"입사일기준" },
  "부여일기준": { bg:"bg-amber-50",  text:"text-amber-700", label:"부여일기준" },
};

const APPROVAL_BADGE: Record<number, { cls:string; label:string; labelShort:string }> = {
  0: { cls:"bg-gray-100 text-gray-500",     label:"자동승인",     labelShort:"자동" },
  1: { cls:"bg-sky-100 text-sky-700",       label:"팀장 1단계",   labelShort:"팀장" },
  2: { cls:"bg-indigo-100 text-indigo-700", label:"팀장 → PM",   labelShort:"팀장→PM" },
};

function newBlank(): Partial<LT> {
  return {
    code:"", name:"", daysPerUnit:1, deductFromBalance:true, approvalSteps:2,
    maxPerMonth:null, maxPerYear:null, requiresStamp:false, stampCount:null,
    allowsFullDay:true, allowsHalfDay:false, halfDayAmPm:"BOTH", applyGroupKey:null,
    isHalf:false, isAmOnly:false, isPmOnly:false,
    validityBasis:"귀속연도", validityMonths:null, isActive:true, sortOrder:99, color:"#3b82f6",
  };
}

export default function LeaveTypeEditor({ leaveTypes }: { leaveTypes:LT[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<(Partial<LT> & { isNew?:boolean }) | null>(null);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const [showInactive, setShowInactive] = useState(false);

  function openNew()      { setEditing({ ...newBlank(), isNew:true }); setErr(""); }
  function openEdit(lt:LT){
    setEditing({
      ...lt,
      allowsFullDay: lt.allowsFullDay ?? !lt.isHalf,
      allowsHalfDay: lt.allowsHalfDay ?? lt.isHalf,
      halfDayAmPm: lt.halfDayAmPm ?? "BOTH",
      applyGroupKey: lt.applyGroupKey ?? null,
    });
    setErr("");
  }
  function set<K extends keyof LT>(k:K, v:unknown) {
    setEditing((p) => p ? { ...p, [k]:v } : null);
  }

  async function save() {
    if (!editing) return;
    if (!editing.code || !editing.name) { setErr("코드와 이름은 필수입니다."); return; }
    if (!editing.allowsFullDay && !editing.allowsHalfDay) {
      setErr("종일·반차 중 하나 이상은 허용해야 합니다."); return;
    }
    setSaving(true); setErr("");
    const url    = editing.isNew ? "/api/admin/leave-types" : `/api/admin/leave-types/${editing.id}`;
    const method = editing.isNew ? "POST" : "PATCH";
    const { isNew, ...payload } = editing;
    const res  = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setErr(data.error ?? "저장 실패"); return; }
    setEditing(null);
    router.refresh();
  }

  async function toggleActive(lt:LT) {
    await fetch(`/api/admin/leave-types/${lt.id}`, {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ ...lt, isActive:!lt.isActive }),
    });
    router.refresh();
  }

  const active   = leaveTypes.filter((lt) =>  lt.isActive);
  const inactive = leaveTypes.filter((lt) => !lt.isActive);

  const renderRow = (lt: LT) => {
    const vb = VALIDITY_BADGE[lt.validityBasis];
    const ab = APPROVAL_BADGE[lt.approvalSteps] ?? APPROVAL_BADGE[2];
    const deductCls = lt.deductFromBalance ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600";
    const deductLabel = lt.deductFromBalance ? "연차 차감" : "미차감";
    const slotBadges: string[] = [];
    if (lt.allowsFullDay) slotBadges.push("종일");
    if (lt.allowsHalfDay && (lt.halfDayAmPm === "BOTH" || lt.halfDayAmPm === "AM_ONLY")) slotBadges.push("오전");
    if (lt.allowsHalfDay && (lt.halfDayAmPm === "BOTH" || lt.halfDayAmPm === "PM_ONLY")) slotBadges.push("오후");
    return (
      <tr key={lt.id} className={`hover:bg-gray-50 border-b border-gray-100 last:border-0 ${!lt.isActive ? "opacity-40" : ""}`}>
        {/* 유형명 */}
        <td className="px-3 sm:px-4 py-3 min-w-[120px]">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white shadow-sm" style={{background:lt.color}}/>
            <span className="font-medium text-gray-800 text-sm">{lt.name}</span>
            {(lt.allowsHalfDay && !lt.allowsFullDay) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">반차만</span>}
            {(lt.allowsFullDay && lt.allowsHalfDay) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">종일+반차</span>}
            {lt.requiresStamp && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">스탬프</span>}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5 ml-5 font-mono">{lt.code}</div>
        </td>
        {/* 결재 */}
        <td className="px-2 sm:px-3 py-3 text-center whitespace-nowrap">
          <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${ab.cls}`} title={ab.label}>{ab.label}</span>
        </td>
        {/* 차감 */}
        <td className="px-2 sm:px-3 py-3 text-center">
          <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${deductCls}`} title={deductLabel}>
            {lt.deductFromBalance ? "차감" : "미차감"}
          </span>
        </td>
        {/* 유효기간 기준 */}
        <td className="px-2 sm:px-3 py-3 text-center hidden md:table-cell">
          {vb ? (
            <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${vb.bg} ${vb.text}`}>
              {vb.label}
              {lt.validityMonths ? ` · ${lt.validityMonths}개월` : ""}
            </span>
          ) : (
            <span className="text-[11px] text-gray-400">{lt.validityBasis}</span>
          )}
        </td>
        {/* 제한 */}
        <td className="px-2 sm:px-3 py-3 text-center hidden lg:table-cell">
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {lt.daysPerUnit !== 1 && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{lt.daysPerUnit}일/단위</span>}
            {lt.maxPerMonth && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">월{lt.maxPerMonth}회</span>}
            {lt.maxPerYear  && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">연{lt.maxPerYear}일</span>}
            {lt.requiresStamp && <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">×{lt.stampCount}개</span>}
          </div>
        </td>
        {/* 신청가능시간 */}
        <td className="px-2 sm:px-3 py-3 text-center hidden xl:table-cell">
          <div className="flex items-center justify-center gap-1 flex-wrap">
            {slotBadges.map((s) => (
              <span key={s} className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                {s}
              </span>
            ))}
          </div>
        </td>
        {/* 상태 토글 */}
        <td className="px-2 sm:px-3 py-3 text-center">
          <button onClick={()=>toggleActive(lt)} title={lt.isActive ? "클릭하면 비활성화" : "클릭하면 활성화"}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium transition px-2.5 py-1 rounded-full"
            style={lt.isActive
              ? {background:"#ecfdf5", color:"#065f46"}
              : {background:"#f3f4f6", color:"#6b7280"}}>
            {lt.isActive ? <ToggleRight size={14}/> : <ToggleLeft size={14}/>}
            {lt.isActive ? "활성" : "비활성"}
          </button>
        </td>
        {/* 수정 */}
        <td className="px-2 sm:px-3 py-3 text-center">
          <button onClick={()=>openEdit(lt)}
            className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded hover:bg-blue-50 transition font-medium">
            <Pencil size={12}/> 수정
          </button>
        </td>
      </tr>
    );
  };

  /** 모바일용 카드 한 장 (휴가 유형 1개) */
  const renderCard = (lt: LT) => {
    const vb = VALIDITY_BADGE[lt.validityBasis];
    const ab = APPROVAL_BADGE[lt.approvalSteps] ?? APPROVAL_BADGE[2];
    const slotBadges: string[] = [];
    if (lt.allowsFullDay) slotBadges.push("종일");
    if (lt.allowsHalfDay && (lt.halfDayAmPm === "BOTH" || lt.halfDayAmPm === "AM_ONLY")) slotBadges.push("오전");
    if (lt.allowsHalfDay && (lt.halfDayAmPm === "BOTH" || lt.halfDayAmPm === "PM_ONLY")) slotBadges.push("오후");
    return (
      <div key={lt.id} className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${!lt.isActive ? "opacity-60" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white shadow-sm" style={{background:lt.color}}/>
            <div className="min-w-0">
              <p className="font-medium text-gray-800 truncate">{lt.name}</p>
              <p className="text-xs text-gray-400 font-mono">{lt.code}</p>
            </div>
            {(lt.allowsHalfDay && !lt.allowsFullDay) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium shrink-0">반차만</span>}
            {(lt.allowsFullDay && lt.allowsHalfDay) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium shrink-0">종일+반차</span>}
            {lt.requiresStamp && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium shrink-0">스탬프</span>}
          </div>
          <button onClick={()=>toggleActive(lt)} title={lt.isActive ? "비활성화" : "활성화"}
            className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100"
            style={lt.isActive ? {color:"#065f46"} : {color:"#6b7280"}}>
            {lt.isActive ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${ab.cls}`}>결재: {ab.label}</span>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${lt.deductFromBalance ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
            {lt.deductFromBalance ? "연차 차감" : "미차감"}
          </span>
          {vb && <span className={`text-xs px-2 py-1 rounded-full font-medium ${vb.bg} ${vb.text}`}>{vb.label}</span>}
        </div>
        {(lt.daysPerUnit !== 1 || lt.maxPerMonth || lt.maxPerYear || lt.requiresStamp) && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-gray-500">
            {lt.daysPerUnit !== 1 && <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{lt.daysPerUnit}일/단위</span>}
            {lt.maxPerMonth && <span>월{lt.maxPerMonth}회</span>}
            {lt.maxPerYear && <span>연{lt.maxPerYear}일</span>}
            {lt.requiresStamp && <span className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">×{lt.stampCount}개</span>}
          </div>
        )}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {slotBadges.map((s) => (
            <span key={s} className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
              {s} 신청 가능
            </span>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button onClick={()=>openEdit(lt)}
            className="w-full py-2 rounded-lg text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition flex items-center justify-center gap-1.5">
            <Pencil size={14}/> 수정
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">활성 <strong className="text-gray-800">{active.length}</strong>개 · 비활성 {inactive.length}개</p>
        <button onClick={openNew} className="btn-primary text-sm flex items-center gap-1.5 py-2 px-4">
          <PlusCircle size={14}/> 유형 추가
        </button>
      </div>

      {/* 모바일: 카드 리스트 (차감·결재 문구 잘리지 않음) */}
      <div className="md:hidden space-y-3">
        {active.map(renderCard)}
      </div>

      {/* PC: 테이블 */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">휴가 유형</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">결재</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">연차 차감</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">유효기간</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide hidden lg:table-cell">제한</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide hidden xl:table-cell">신청 가능 시간</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">상태</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">편집</th>
            </tr>
          </thead>
          <tbody>
            {active.map(renderRow)}
          </tbody>
        </table>
      </div>

      {/* 비활성 토글 */}
      {inactive.length > 0 && (
        <div>
          <button onClick={()=>setShowInactive((v)=>!v)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded hover:bg-gray-100 transition">
            <ChevronDown size={14} className={`transition-transform ${showInactive?"rotate-180":""}`}/>
            비활성 유형 {inactive.length}개 {showInactive?"숨기기":"보기"}
          </button>
          {showInactive && (
            <>
              <div className="md:hidden space-y-3 mt-3">
                {inactive.map(renderCard)}
              </div>
              <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm mt-2">
                <table className="w-full text-sm min-w-[640px]">
                  <tbody>
                    {inactive.map(renderRow)}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* 편집 모달 */}
      {editing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-xl z-10">
              <h2 className="text-base font-bold text-gray-800">
                {editing.isNew ? "휴가유형 추가" : `'${editing.name}' 수정`}
              </h2>
              <button onClick={()=>setEditing(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                <X size={16}/>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">코드 <span className="text-red-500">*</span></label>
                  <input className="input font-mono text-sm" placeholder="예: ANNUAL" value={editing.code??""}
                    onChange={(e)=>set("code",e.target.value.toUpperCase())} />
                  <p className="text-xs text-gray-400 mt-1">영문 대문자, 변경 불가</p>
                </div>
                <div>
                  <label className="label">유형명 <span className="text-red-500">*</span></label>
                  <input className="input" placeholder="예: 연차" value={editing.name??""}
                    onChange={(e)=>set("name",e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">일수/단위</label>
                  <input type="number" step="0.5" min="0" className="input" value={editing.daysPerUnit??1}
                    onChange={(e)=>set("daysPerUnit",parseFloat(e.target.value))} />
                  <p className="text-xs text-gray-400 mt-1">반차=0.5, 힐링=0</p>
                </div>
                <div>
                  <label className="label">색상 표시</label>
                  <div className="flex gap-2 items-center mt-1">
                    <input type="color" className="h-9 w-12 rounded border border-gray-200 cursor-pointer p-0.5" value={editing.color??"#3b82f6"}
                      onChange={(e)=>set("color",e.target.value)} />
                    <input className="input flex-1 text-xs font-mono" value={editing.color??"#3b82f6"}
                      onChange={(e)=>set("color",e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">정렬순서</label>
                  <input type="number" className="input" value={editing.sortOrder??99}
                    onChange={(e)=>set("sortOrder",parseInt(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">결재 단계</label>
                  <select className="input" value={editing.approvalSteps??2}
                    onChange={(e)=>set("approvalSteps",parseInt(e.target.value))}>
                    <option value={0}>자동 승인 (힐링데이 등)</option>
                    <option value={1}>1단계 — 팀장까지</option>
                    <option value={2}>2단계 — 팀장 → PM</option>
                  </select>
                </div>
                <div>
                  <label className="label">연차 차감 여부</label>
                  <select className="input" value={String(editing.deductFromBalance??true)}
                    onChange={(e)=>set("deductFromBalance",e.target.value==="true")}>
                    <option value="true">연차에서 차감</option>
                    <option value="false">차감 안함 (별도 휴가)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">전용 부여 풀 (allocationSourceCode)</label>
                <input className="input font-mono text-sm" placeholder="비움 = 연차만 또는 미차감만"
                  value={editing.allocationSourceCode ?? ""}
                  onChange={(e)=>{
                    const v = e.target.value.trim();
                    set("allocationSourceCode", v ? v.toUpperCase() : null);
                  }} />
                <p className="text-xs text-gray-400 mt-1">
                  돌봄 CARE, 포상 AWARD 등 관리자 부여의 sourceCode와 동일하게 넣으면 신청 시 그 잔여만큼만 사용됩니다.
                </p>
              </div>

              <div>
                <label className="label">신청 화면 그룹 키 (선택)</label>
                <input className="input font-mono text-sm" placeholder="예: annual, care, holidayExt — 비우면 기타"
                  value={editing.applyGroupKey ?? ""}
                  onChange={(e)=>{
                    const v = e.target.value.trim();
                    set("applyGroupKey", v || null);
                  }} />
                <p className="text-xs text-gray-400 mt-1">휴가 신청 카테고리 탭을 나눕니다. 시드 기본값은 코드별로 정해져 있습니다.</p>
              </div>

              {/* 유효기간 */}
              <fieldset className="rounded-lg bg-blue-50/40 border border-blue-100 p-4 space-y-3">
                <legend className="text-xs font-semibold text-blue-800 px-1">유효기간 설정</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">기준</label>
                    <select className="input" value={editing.validityBasis??"귀속연도"}
                      onChange={(e)=>set("validityBasis",e.target.value)}>
                      {VALIDITY_OPTIONS.map(({value,label})=>(
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">유효 개월 수</label>
                    <input type="number" placeholder="귀속연도 말일까지" className="input"
                      value={editing.validityMonths??""}
                      onChange={(e)=>set("validityMonths",e.target.value?parseInt(e.target.value):null)} />
                    <p className="text-xs text-gray-400 mt-1">비워두면 귀속연도 4/30까지</p>
                  </div>
                </div>
              </fieldset>

              {/* 제한 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">월 최대 횟수</label>
                  <input type="number" step="0.5" placeholder="무제한" className="input"
                    value={editing.maxPerMonth??""}
                    onChange={(e)=>set("maxPerMonth",e.target.value?parseFloat(e.target.value):null)} />
                </div>
                <div>
                  <label className="label">연간 최대 일수</label>
                  <input type="number" step="1" placeholder="무제한" className="input"
                    value={editing.maxPerYear??""}
                    onChange={(e)=>set("maxPerYear",e.target.value?parseFloat(e.target.value):null)} />
                </div>
              </div>

              {/* 신청 방식 */}
              <fieldset className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                <legend className="text-xs font-semibold text-gray-600 px-1">신청 방식</legend>
                <p className="text-xs text-gray-500 mb-2">직원 신청 화면에서 종일(기간)·반차를 허용할 범위입니다.</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600"
                      checked={!!editing.allowsFullDay}
                      onChange={(e)=>set("allowsFullDay", e.target.checked)} />
                    <span className="text-gray-700">종일(시작~종료일) 신청 가능</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-blue-600"
                      checked={!!editing.allowsHalfDay}
                      onChange={(e)=>set("allowsHalfDay", e.target.checked)} />
                    <span className="text-gray-700">반차(0.5일) 신청 가능</span>
                  </label>
                  {editing.allowsHalfDay && (
                    <div>
                      <label className="label">반차 옵션</label>
                      <select className="input" value={editing.halfDayAmPm ?? "BOTH"}
                        onChange={(e)=>set("halfDayAmPm", e.target.value)}>
                        <option value="BOTH">오전 또는 오후 선택</option>
                        <option value="AM_ONLY">오전만</option>
                        <option value="PM_ONLY">오후만</option>
                      </select>
                      <p className="text-xs text-gray-400 mt-1">종일+반차를 모두 허용하면 신청 시 종일·오전·오후 중 택일합니다.</p>
                    </div>
                  )}
                </div>
              </fieldset>

              {/* 기타 속성 */}
              <fieldset className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                <legend className="text-xs font-semibold text-gray-600 px-1">기타</legend>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {([
                    ["requiresStamp", "스탬프 쿠폰 필요"],
                    ["isActive",      "활성화"],
                  ] as [keyof LT, string][]).map(([k,l]) => (
                    <label key={k as string} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                      <input type="checkbox" className="w-4 h-4 accent-blue-600"
                        checked={!!(editing as Record<string,unknown>)[k as string]}
                        onChange={(e)=>set(k, e.target.checked)} />
                      <span className="text-gray-700">{l}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {editing.requiresStamp && (
                <div>
                  <label className="label">필요 스탬프 수</label>
                  <input type="number" className="input" value={editing.stampCount??5}
                    onChange={(e)=>set("stampCount",parseInt(e.target.value))} />
                </div>
              )}
            </div>

            {err && (
              <div className="mx-6 mb-3 px-4 py-2.5 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">{err}</div>
            )}

            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3 rounded-b-xl">
              <button onClick={()=>setEditing(null)} className="btn-secondary flex-1">취소</button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1 disabled:opacity-60">
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

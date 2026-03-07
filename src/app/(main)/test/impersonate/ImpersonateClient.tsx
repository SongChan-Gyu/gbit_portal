"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMDWithDay } from "@/lib/dateUtils";
import ApproveActions from "../../leave/approve/ApproveActions";
import CancelApproveActions from "../../leave/approve/CancelApproveActions";

interface Approver { id:string; name:string; position:string; team:{ name:string }|null; }
interface PendingAp {
  id:string; step:number; status:string;
  approver:Approver;
  leaveRequest:{
    id:string; totalDays:number; startDate:string; endDate:string; reason:string|null;
    currentStep:number; totalSteps:number; status:string;
    employee:{ name:string; team:{ name:string }|null; position:string };
    items:{ leaveType:{ name:string; color:string }; days:number }[];
    approvals:{ id:string; step:number; status:string; approver:{ name:string } }[];
  };
}
interface Emp { id:string; name:string; team:{ name:string }|null; }
interface LT { id:string; code:string; name:string; }

export default function ImpersonateClient({
  approvers,
  pendingApprovals,
  cancelApprovals,
  employees,
  leaveTypes,
  todayStr,
}: {
  approvers: Approver[];
  pendingApprovals: PendingAp[];
  cancelApprovals: PendingAp[];
  employees: Emp[];
  leaveTypes: LT[];
  todayStr: string;
}) {
  const [selected, setSelected] = useState<string>("");
  const router = useRouter();

  const myApprovals = selected
    ? pendingApprovals.filter((ap) =>
        ap.approver.id === selected &&
        ap.leaveRequest.currentStep === ap.step
      )
    : [];

  const myCancelApprovals = selected
    ? cancelApprovals.filter((ap) =>
        ap.approver.id === selected &&
        ap.leaveRequest?.currentStep === ap.step &&
        ap.leaveRequest?.status === "CANCEL_REQUESTED"
      )
    : [];

  // 휴가 신청 올리기
  const [qlEmpId, setQlEmpId] = useState("");
  const [qlLeaveType, setQlLeaveType] = useState(leaveTypes[0]?.code ?? "ANNUAL");
  const [qlStart, setQlStart] = useState(todayStr);
  const [qlEnd, setQlEnd] = useState(todayStr);
  const [qlReason, setQlReason] = useState("(결재 테스트)");
  const [qlLoading, setQlLoading] = useState(false);
  const [qlResult, setQlResult] = useState("");

  async function createQuickLeave() {
    if (!qlEmpId) { setQlResult("❌ 신청 대상을 선택하세요."); return; }
    setQlLoading(true); setQlResult("");
    const res = await fetch("/api/test/quick-leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId: qlEmpId,
        leaveTypeCode: qlLeaveType,
        startDate: qlStart,
        endDate: qlEnd,
        reason: qlReason,
      }),
    });
    const data = await res.json();
    setQlLoading(false);
    if (res.ok) setQlResult("✅ 휴가 신청 생성 완료 (ID: " + data.id + ")"); else setQlResult("❌ " + (data.error ?? "실패"));
    router.refresh();
  }

  // 카카오 알림톡 테스트
  const [alimPhone, setAlimPhone] = useState("");
  const [alimTemplate, setAlimTemplate] = useState("LEAVE_REQUEST");
  const [alimLoading, setAlimLoading] = useState(false);
  const [alimResult, setAlimResult] = useState("");

  async function sendTestAlimtalk() {
    if (!alimPhone.trim()) { setAlimResult("❌ 수신 번호를 입력하세요."); return; }
    setAlimLoading(true); setAlimResult("");
    const res = await fetch("/api/test/send-alimtalk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: alimPhone.trim(), template: alimTemplate }),
    });
    const data = await res.json();
    setAlimLoading(false);
    if (res.ok) setAlimResult("✅ " + (data.message ?? "발송 요청 완료")); else setAlimResult("❌ " + (data.error ?? "실패"));
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="label">결재자 선택</label>
        <select className="input" value={selected} onChange={(e) => { setSelected(e.target.value); router.refresh(); }}>
          <option value="">결재자를 선택하세요</option>
          {approvers.map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.team?.name ?? "-"} · {a.position})</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          휴가 결재 대기 {pendingApprovals.filter((ap)=>ap.leaveRequest.currentStep===ap.step).length}건
          / 취소 결재 대기 {cancelApprovals.filter((ap)=>ap.leaveRequest?.status==="CANCEL_REQUESTED" && ap.leaveRequest?.currentStep===ap.step).length}건
        </p>
      </div>

      {/* ── 1. 휴가 결재 대기 ───────────────────────────── */}
      {selected && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            휴가 결재 대기 ({myApprovals.length}건)
          </h2>
          {myApprovals.length === 0 ? (
            <div className="card text-center py-6 text-gray-400 text-sm">결재 대기 건 없음</div>
          ) : (
            <div className="space-y-4">
              {myApprovals.map((ap) => {
                const req = ap.leaveRequest;
                return (
                  <div key={ap.id} className="card">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold">{req.employee.name}
                          <span className="ml-2 text-xs text-gray-500">{req.employee.team?.name} · {req.employee.position}</span>
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {req.items.map((it,i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                              style={{background:`${it.leaveType.color}20`, color:it.leaveType.color}}>
                              {it.leaveType.name} {it.days}일
                            </span>
                          ))}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {formatMDWithDay(req.startDate)}
                          {req.startDate!==req.endDate && ` ~ ${formatMDWithDay(req.endDate)}`}
                          <span className="ml-2 font-semibold">총 {req.totalDays}일</span>
                        </p>
                        {req.reason && <p className="text-xs text-gray-400 mt-0.5">사유: {req.reason}</p>}
                      </div>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                        {ap.step}단계/{req.totalSteps}단계
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs mb-4">
                      {req.approvals.map((a, i) => (
                        <span key={a.id} className="flex items-center gap-1">
                          {i > 0 && <span className="text-gray-300">→</span>}
                          <span className={`px-2 py-0.5 rounded-full ${
                            a.status==="APPROVED"?"bg-green-100 text-green-700":
                            a.id===ap.id?"bg-blue-100 text-blue-700":"bg-gray-100 text-gray-500"
                          }`}>{a.approver.name}{a.status==="APPROVED"?" ✓":a.id===ap.id?" ◉":""}</span>
                        </span>
                      ))}
                    </div>
                    <ApproveActions approvalId={ap.id} impersonateId={selected} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 2. 결재 취소 대기 ───────────────────────────── */}
      {selected && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            결재 취소 대기 ({myCancelApprovals.length}건)
          </h2>
          {myCancelApprovals.length === 0 ? (
            <div className="card text-center py-6 text-gray-400 text-sm">취소 결재 대기 건 없음</div>
          ) : (
            <div className="space-y-4">
              {myCancelApprovals.map((ap) => {
                const req = ap.leaveRequest;
                if (!req) return null;
                return (
                  <div key={ap.id} className="card border-l-4 border-amber-400">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold">{req.employee.name}
                          <span className="ml-2 text-xs text-gray-500">{req.employee.team?.name}</span>
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {req.items.map((it,i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                              style={{background:`${it.leaveType.color}20`, color:it.leaveType.color}}>
                              {it.leaveType.name} {it.days}일
                            </span>
                          ))}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">취소 신청 · {ap.step}단계/{req.totalSteps}단계</p>
                      </div>
                    </div>
                    <CancelApproveActions requestId={req.id} impersonateId={selected} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 3. 휴가 신청 올리기 (테스트용) ───────────────── */}
      <div className="card bg-slate-50 border-slate-200">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">휴가 신청 올리기 (테스트)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">신청자</label>
            <select className="input" value={qlEmpId} onChange={(e)=>setQlEmpId(e.target.value)}>
              <option value="">선택</option>
              {employees.map((e)=>(<option key={e.id} value={e.id}>{e.team?.name ?? "-"} · {e.name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">휴가 유형</label>
            <select className="input" value={qlLeaveType} onChange={(e)=>setQlLeaveType(e.target.value)}>
              {leaveTypes.map((lt)=>(<option key={lt.id} value={lt.code}>{lt.name}</option>))}
            </select>
          </div>
          <div>
            <label className="label">시작일</label>
            <input type="date" className="input" value={qlStart} onChange={(e)=>setQlStart(e.target.value)} />
          </div>
          <div>
            <label className="label">종료일</label>
            <input type="date" className="input" value={qlEnd} min={qlStart} onChange={(e)=>setQlEnd(e.target.value)} />
          </div>
        </div>
        <div className="mb-3">
          <label className="label">사유</label>
          <input className="input" value={qlReason} onChange={(e)=>setQlReason(e.target.value)} />
        </div>
        {qlResult && <p className={`text-sm mb-2 ${qlResult.startsWith("✅")?"text-green-600":"text-red-600"}`}>{qlResult}</p>}
        <button onClick={createQuickLeave} disabled={qlLoading} className="btn-primary text-sm py-2 px-4">
          {qlLoading ? "생성 중…" : "휴가 신청 생성"}
        </button>
      </div>

      {/* ── 4. 카카오 알림톡 테스트 ─────────────────────── */}
      <div className="card bg-slate-50 border-slate-200">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">카카오 알림톡 테스트</h2>
        <div className="flex flex-wrap gap-3 items-end mb-3">
          <div className="flex-1 min-w-[120px]">
            <label className="label">수신 번호</label>
            <input className="input" placeholder="01012345678" value={alimPhone} onChange={(e)=>setAlimPhone(e.target.value)} />
          </div>
          <div className="w-48">
            <label className="label">템플릿</label>
            <select className="input" value={alimTemplate} onChange={(e)=>setAlimTemplate(e.target.value)}>
              <option value="LEAVE_REQUEST">휴가 신청 알림</option>
              <option value="INVITE_REGISTER">초대(회원가입) 링크</option>
              <option value="LEAVE_RESULT">휴가 결과 알림</option>
            </select>
          </div>
          <button onClick={sendTestAlimtalk} disabled={alimLoading} className="btn-secondary text-sm py-2 px-4">
            {alimLoading ? "발송 중…" : "알림톡 발송 테스트"}
          </button>
        </div>
        {alimResult && <p className={`text-sm ${alimResult.startsWith("✅")?"text-green-600":"text-red-600"}`}>{alimResult}</p>}
      </div>
    </div>
  );
}

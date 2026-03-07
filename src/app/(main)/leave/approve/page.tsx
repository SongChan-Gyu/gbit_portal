import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import ApproveActions from "./ApproveActions";
import CancelApproveActions from "./CancelApproveActions";
import AdminCancelButton from "./AdminCancelButton";
import ExpandablePanel from "./ExpandablePanel";
import StampApproveClient from "@/app/(main)/stamp/approve/StampApproveClient";
import { serializeDates } from "@/lib/serialize";
import { formatMDWithDay, formatYMD } from "@/lib/dateUtils";

export default async function ApprovePage({
  searchParams,
}: { searchParams: Promise<{ view?: string; tab?: string }> }) {
  const session = await auth();
  const user = session!.user as any;
  if (!["TEAM_LEAD","PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const { view: viewRaw, tab: tabRaw } = await searchParams;
  const tab  = tabRaw  ?? "leave";
  const view = viewRaw ?? "pending";

  // ── 휴가 결재 데이터 (관리자는 본인 결재 건만; 전체 내역은 별도 조회) ──────────────────────────────────
  const approvals = await prisma.leaveApproval.findMany({
    where: {
      approverId: user.employeeId,
      ...(view === "pending" ? { status: "PENDING" } : {}),
    },
    include: {
      leaveRequest: {
        include: {
          employee: { include: { team: true } },
          items: { include: { leaveType: true } },
          approvals: { include: { approver: true }, orderBy: { step: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const cancelApprovals = await prisma.leaveApproval.findMany({
    where: {
      approverId: user.employeeId,
      ...(view === "pending"
        ? { status: "CANCEL_PENDING" }
        : { status: { in: ["CANCEL_PENDING","CANCEL_APPROVED","CANCEL_REJECTED"] } }),
    },
    include: {
      leaveRequest: {
        include: {
          employee: { include: { team: true } },
          items: { include: { leaveType: true } },
          approvals: { include: { approver: true }, orderBy: { step: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // ── 스탬프 결재 데이터 ────────────────────────────────
  const stampRequests = await prisma.stampRequest.findMany({
    where: {
      approverId: user.employeeId,
      ...(view === "pending" ? { status: "PENDING" } : {}),
    },
    include: { employee: { include: { team: true } } },
    orderBy: { stampDate: "desc" },
  });

  const actionable       = approvals.filter(ap => ap.status === "PENDING" && ap.leaveRequest.currentStep === ap.step);
  const cancelActionable = cancelApprovals.filter(ap =>
    ap.status === "CANCEL_PENDING" && ap.leaveRequest.currentStep === ap.step && ap.leaveRequest.status === "CANCEL_REQUESTED"
  );
  const pastApprovals = approvals.filter(ap => ap.status !== "PENDING");
  const pastCancel    = cancelApprovals.filter(ap => ap.status !== "CANCEL_PENDING");

  const leavePending  = actionable.length + cancelActionable.length;
  const stampPending  = stampRequests.filter(r => r.status === "PENDING").length;
  const totalPending  = leavePending + stampPending;

  // 관리자: 전체 휴가 내역 (모든 직원, 승인/대기/취소신청) — 조회 및 직권 취소용
  const adminAllRequests =
    user.role === "ADMIN"
      ? await prisma.leaveRequest.findMany({
          where: { status: { in: ["PENDING", "APPROVED", "CANCEL_REQUESTED"] } },
          include: {
            employee: { include: { team: true } },
            items: { include: { leaveType: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : [];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">결재함</h1>
          <p className="page-subtitle">휴가 신청, 취소 신청, 스탬프 요청을 처리합니다.</p>
        </div>
        {totalPending > 0 && (
          <span className="badge badge-warning text-sm px-2 py-1">미처리 {totalPending}건</span>
        )}
      </div>

      {/* 탭: 휴가결재 / 스탬프승인 */}
      <div className="flex gap-2 mb-4 border-b border-gray-200 pb-0 text-[15px] md:text-sm">
        <a href={`?tab=leave&view=${view}`}
          className={`px-4 py-3 md:py-2.5 font-medium border-b-2 -mb-px transition-colors touch-manipulation ${
            tab === "leave"
              ? "border-slate-600 text-slate-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}>
          휴가 결재
          {leavePending > 0 && (
            <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5 font-semibold">
              {leavePending}
            </span>
          )}
        </a>
        <a href={`?tab=stamp&view=${view}`}
          className={`px-4 py-3 md:py-2.5 font-medium border-b-2 -mb-px transition-colors touch-manipulation ${
            tab === "stamp"
              ? "border-slate-600 text-slate-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}>
          스탬프 승인
          {stampPending > 0 && (
            <span className="ml-1.5 text-xs bg-amber-100 text-amber-600 rounded-full px-1.5 py-0.5 font-semibold">
              {stampPending}
            </span>
          )}
        </a>
      </div>

      {/* 대기/전체/관리자전체 서브탭 */}
      <div className="flex flex-wrap gap-2 mb-5">
        {["pending","all"].map((v) => (
          <a key={v} href={`?tab=${tab}&view=${v}`}
            className={`btn-sm ${view === v ? "btn-primary" : "btn-secondary"}`}>
            {v === "pending"
              ? `대기 (${tab === "stamp" ? stampPending : leavePending})`
              : "전체 내역"}
          </a>
        ))}
        {user.role === "ADMIN" && tab === "leave" && (
          <a href="?tab=leave&view=admin"
            className={`btn-sm ${view === "admin" ? "btn-primary" : "btn-secondary"}`}>
            전체 휴가 내역(관리자)
          </a>
        )}
      </div>

      {/* ── 휴가 결재 탭 ─────────────────────────────── */}
      {tab === "leave" && (
        <>
          {view === "pending" && (
            <div className="space-y-3">
              {leavePending === 0 && (
                <div className="panel">
                  <div className="panel-body text-center py-10 text-gray-400 text-sm">
                    처리할 결재가 없습니다.
                  </div>
                </div>
              )}

              {actionable.map((ap) => {
                const req = ap.leaveRequest;
                return (
                  <ExpandablePanel
                    key={ap.id}
                    borderColor="slate"
                    summary={
                      <>
                        <div className="min-w-0">
                          <span className="text-xs md:text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium mr-2">휴가신청</span>
                          <span className="font-semibold text-gray-800">{req.employee.name}</span>
                          <span className="text-gray-500 text-sm ml-1.5">{req.items.map((i) => `${i.leaveType.name} ${i.days}일`).join(" ")}</span>
                        </div>
                        <span className="text-xs text-gray-500 shrink-0">{ap.step}단계/{req.totalSteps}단계</span>
                      </>
                    }
                    detail={
                      <div className="panel-body">
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {req.items.map((it) => (
                            <span key={it.id} className="text-sm px-2 py-0.5 rounded border font-medium"
                              style={{ color: it.leaveType.color, borderColor: `${it.leaveType.color}40`, background: `${it.leaveType.color}10` }}>
                              {it.leaveType.name} {it.days}일{it.reason?.trim() && it.reason.trim().length >= 2 ? ` — ${it.reason.trim()}` : ""}
                            </span>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div>
                          <span className="text-gray-500 text-xs">기간</span>
                          <p className="font-medium text-[15px]">
                            {formatMDWithDay(req.startDate)}
                            {req.startDate.toDateString() !== req.endDate.toDateString() &&
                              ` ~ ${formatMDWithDay(req.endDate)}`}
                            <span className="ml-1 text-slate-700 font-bold">{req.totalDays}일</span>
                          </p>
                        </div>
                          <div>
                            <span className="text-gray-500 text-xs">신청일</span>
                            <p className="font-medium text-[15px]">{formatYMD(req.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
                          {req.approvals
                            .filter((a,i,arr) => arr.findIndex(x => x.step===a.step && ["PENDING","APPROVED","REJECTED"].includes(x.status))===i)
                            .map((a, i) => (
                            <span key={a.id} className="flex items-center gap-1.5">
                              {i > 0 && <span className="text-gray-300">→</span>}
                              <span className={`px-2 py-0.5 rounded border text-xs ${
                                a.status==="APPROVED" ? "bg-slate-100 text-slate-700 border-slate-300"
                                  : a.id===ap.id ? "bg-slate-100 text-slate-800 border-slate-400"
                                  : "bg-gray-50 text-gray-500 border-gray-200"
                              }`}>
                                {a.approver.name}{a.status==="APPROVED"?" ✓":a.id===ap.id?" ◉":""}
                              </span>
                            </span>
                          ))}
                        </div>
                        <ApproveActions approvalId={ap.id} />
                      </div>
                    }
                  />
                );
              })}

              {cancelActionable.map((ap) => {
                const req = ap.leaveRequest;
                return (
                  <ExpandablePanel
                    key={ap.id}
                    borderColor="amber"
                    summary={
                      <>
                        <div className="min-w-0">
                          <span className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded font-medium mr-2">취소신청</span>
                          <span className="font-semibold text-gray-800">{req.employee.name}</span>
                          <span className="text-gray-500 text-sm ml-1.5">{req.items.map((i) => `${i.leaveType.name} ${i.days}일`).join(" ")}</span>
                        </div>
                        <span className="text-xs text-gray-500 shrink-0">{ap.step}단계/{req.totalSteps}단계</span>
                      </>
                    }
                    detail={
                      <div className="panel-body">
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {req.items.map((it) => (
                            <span key={it.id} className="text-sm px-2 py-0.5 rounded border font-medium"
                              style={{ color: it.leaveType.color, borderColor: `${it.leaveType.color}40`, background: `${it.leaveType.color}10` }}>
                              {it.leaveType.name} {it.days}일
                            </span>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div>
                          <span className="text-gray-500 text-xs">원래 휴가 기간</span>
                          <p className="font-medium text-[15px]">
                            {formatMDWithDay(req.startDate)}
                            {req.startDate.toDateString() !== req.endDate.toDateString() &&
                              ` ~ ${formatMDWithDay(req.endDate)}`}
                            <span className="ml-1 text-slate-700 font-bold">{req.totalDays}일</span>
                          </p>
                        </div>
                          <div>
                            <span className="text-gray-500 text-xs">취소 사유</span>
                            <p className="font-medium text-[15px] text-amber-800">{req.cancelReason ?? "-"}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
                          {req.approvals
                            .filter(a => ["CANCEL_PENDING","CANCEL_APPROVED","CANCEL_REJECTED"].includes(a.status))
                            .map((a, i) => (
                            <span key={a.id} className="flex items-center gap-1.5">
                              {i > 0 && <span className="text-gray-300">→</span>}
                              <span className={`px-2 py-0.5 rounded border text-xs ${
                                a.status==="CANCEL_APPROVED" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : a.status==="CANCEL_REJECTED" ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : a.id===ap.id ? "bg-orange-50 text-orange-700 border-orange-300"
                                  : "bg-gray-50 text-gray-500 border-gray-200"
                              }`}>
                                {a.approver.name}{a.status==="CANCEL_APPROVED"?" ✓":a.status==="CANCEL_REJECTED"?" ✗":a.id===ap.id?" ◉":""}
                              </span>
                            </span>
                          ))}
                        </div>
                        <CancelApproveActions requestId={req.id} />
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}

          {view === "admin" && user.role === "ADMIN" && (
            <div className="panel">
              <p className="px-4 py-2 text-sm text-gray-500 border-b border-gray-200 md:text-xs">
                모든 직원의 휴가 신청·승인 내역입니다. 필요 시 관리자 직권 취소를 할 수 있습니다.
              </p>
              <div className="table-scroll">
              <table className="data-table request-list-table">
                <thead>
                  <tr>
                    <th className="request-list-th type">신청자</th>
                    <th className="request-list-th type">유형</th>
                    <th className="request-list-th period">기간(일수)</th>
                    <th className="request-list-th status">상태</th>
                    <th className="request-list-th action">조치</th>
                  </tr>
                </thead>
                <tbody>
                  {adminAllRequests.map((req) => (
                    <tr key={req.id}>
                      <td className="request-list-td type">
                        <p className="font-medium text-[15px] md:text-base">{req.employee.name}</p>
                        <p className="text-xs text-gray-500">{req.employee.team?.name}</p>
                      </td>
                      <td className="request-list-td type text-[15px] md:text-xs">{req.items.map((i) => i.leaveType.name).join("+")}</td>
                      <td className="request-list-td period whitespace-nowrap text-[15px] md:text-xs">
                        {formatMDWithDay(req.startDate)}
                        {req.startDate.toDateString() !== req.endDate.toDateString() &&
                          ` ~ ${formatMDWithDay(req.endDate)}`}
                        <span className="font-semibold text-slate-700 ml-1">· {req.totalDays}일</span>
                      </td>
                      <td className="request-list-td status">
                        <span className={`badge ${
                          req.status === "APPROVED" ? "badge-success" :
                          req.status === "CANCEL_REQUESTED" ? "badge-warning" :
                          "badge-default"
                        }`}>
                          {req.status === "APPROVED" ? "승인" : req.status === "CANCEL_REQUESTED" ? "취소신청" : "대기"}
                        </span>
                      </td>
                      <td className="request-list-td action">
                        {(req.status === "APPROVED" || req.status === "PENDING") && (
                          <AdminCancelButton requestId={req.id} />
                        )}
                      </td>
                    </tr>
                  ))}
                  {adminAllRequests.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">내역이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {view === "all" && (
            <div className="panel">
              <div className="table-scroll">
              <table className="data-table request-list-table">
                <thead>
                  <tr>
                    <th className="request-list-th type">구분</th>
                    <th className="request-list-th type">신청자</th>
                    <th className="request-list-th type">유형</th>
                    <th className="request-list-th period">기간(일수)</th>
                    <th className="request-list-th status">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {[...actionable,...pastApprovals].map((ap) => {
                    const req = ap.leaveRequest;
                    const statusMap: Record<string,string> = { PENDING:"대기", APPROVED:"승인", REJECTED:"반려" };
                    return (
                      <tr key={ap.id}>
                        <td className="request-list-td type"><span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">신청</span></td>
                        <td className="request-list-td type"><p className="font-medium text-[15px] md:text-base">{req.employee.name}</p><p className="text-xs text-gray-500">{req.employee.team?.name}</p></td>
                        <td className="request-list-td type text-[15px] md:text-xs">{req.items.map(i => i.leaveType.name).join("+")}</td>
                        <td className="request-list-td period whitespace-nowrap text-[15px] md:text-xs">
                          {formatMDWithDay(req.startDate)}
                          {req.startDate.toDateString()!==req.endDate.toDateString() &&
                            ` ~ ${formatMDWithDay(req.endDate)}`}
                          <span className="font-semibold text-slate-700 ml-1">· {req.totalDays}일</span>
                        </td>
                        <td className="request-list-td status"><span className={`badge ${ap.status==="APPROVED"?"badge-success":ap.status==="REJECTED"?"badge-default":"badge-warning"}`}>{statusMap[ap.status]??"대기"}</span></td>
                      </tr>
                    );
                  })}
                  {[...cancelActionable,...pastCancel].map((ap) => {
                    const req = ap.leaveRequest;
                    const statusMap: Record<string,string> = { CANCEL_PENDING:"대기", CANCEL_APPROVED:"취소승인", CANCEL_REJECTED:"취소반려" };
                    return (
                      <tr key={`cancel-${ap.id}`} className="bg-amber-50/30">
                        <td className="request-list-td type"><span className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">취소</span></td>
                        <td className="request-list-td type"><p className="font-medium text-[15px] md:text-base">{req.employee.name}</p><p className="text-xs text-gray-500">{req.employee.team?.name}</p></td>
                        <td className="request-list-td type text-[15px] md:text-xs">{req.items.map(i => i.leaveType.name).join("+")}</td>
                        <td className="request-list-td period whitespace-nowrap text-[15px] md:text-xs">
                          {formatMDWithDay(req.startDate)}
                          {req.startDate.toDateString()!==req.endDate.toDateString() &&
                            ` ~ ${formatMDWithDay(req.endDate)}`}
                          <span className="font-semibold text-slate-700 ml-1">· {req.totalDays}일</span>
                        </td>
                        <td className="request-list-td status"><span className={`badge ${ap.status==="CANCEL_APPROVED"?"badge-success":ap.status==="CANCEL_REJECTED"?"badge-default":"badge-warning"}`}>{statusMap[ap.status]??"대기"}</span></td>
                      </tr>
                    );
                  })}
                  {actionable.length+pastApprovals.length+cancelActionable.length+pastCancel.length===0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400">내역이 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 스탬프 승인 탭 ────────────────────────────── */}
      {tab === "stamp" && (
        <StampApproveClient requests={serializeDates(stampRequests) as any} />
      )}
    </div>
  );
}

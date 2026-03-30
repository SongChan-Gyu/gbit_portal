import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import AdminCancelButton from "./AdminCancelButton";
import LeaveApprovePendingClient from "./LeaveApprovePendingClient";
import StampApproveClient from "@/app/(main)/stamp/approve/StampApproveClient";
import { serializeDates } from "@/lib/serialize";
import { formatMDWithDay } from "@/lib/dateUtils";
import { mergedLeaveTypeLabel } from "@/lib/leaveDisplay";

export default async function ApprovePage({
  searchParams,
}: { searchParams: Promise<{ view?: string; tab?: string }> }) {
  const session = await auth();
  const user = session!.user as any;
  if (!["TEAM_LEAD","PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const self = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  });
  if (self?.employeeType === "EXTERNAL") redirect("/dashboard");

  const params = await searchParams;
  const viewRaw = params.view;
  const tabRaw = params.tab;
  const pageRaw = (params as Record<string, string | undefined>).page;
  const tab  = tabRaw  ?? "leave";
  const view = viewRaw ?? "pending";
  const page = Math.max(1, parseInt(String(pageRaw ?? "1"), 10));
  const PAGE_SIZE = 30;

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

  // 관리자: 전체 휴가 내역 (모든 직원, 승인/대기/취소신청) — 조회 및 직권 취소용 (페이지네이션)
  const adminTotal =
    user.role === "ADMIN"
      ? await prisma.leaveRequest.count({
          where: { status: { in: ["PENDING", "APPROVED", "CANCEL_REQUESTED", "WITHDRAWN", "CANCELLED", "REJECTED"] } },
        })
      : 0;
  const adminAllRequests =
    user.role === "ADMIN"
      ? await prisma.leaveRequest.findMany({
          where: { status: { in: ["PENDING", "APPROVED", "CANCEL_REQUESTED", "WITHDRAWN", "CANCELLED", "REJECTED"] } },
          include: {
            employee: { include: { team: true } },
            items: { include: { leaveType: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        })
      : [];
  const adminTotalPages = Math.ceil(adminTotal / PAGE_SIZE);

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
          className={`px-4 py-3 md:py-2.5 font-medium border-b-2 -mb-px transition-colors touch-manipulation min-h-[44px] flex items-center active:bg-gray-100 rounded-t-lg ${
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
          className={`px-4 py-3 md:py-2.5 font-medium border-b-2 -mb-px transition-colors touch-manipulation min-h-[44px] flex items-center active:bg-gray-100 rounded-t-lg ${
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

              {leavePending > 0 && (
                <LeaveApprovePendingClient
                  actionable={serializeDates(actionable) as any}
                  cancelActionable={serializeDates(cancelActionable) as any}
                />
              )}
            </div>
          )}

          {view === "admin" && user.role === "ADMIN" && (
            <div className="panel">
              <p className="px-4 py-2 text-sm text-gray-500 border-b border-gray-200 md:text-xs">
                모든 직원의 휴가 신청·승인 내역입니다. 필요 시 관리자 직권 취소를 할 수 있습니다.
                {adminTotal > 0 && (
                  <span className="ml-2 font-medium text-gray-600">
                    전체 {adminTotal}건 · {page}/{adminTotalPages}페이지
                  </span>
                )}
              </p>
              {/* 모바일: 카드 */}
              <div className="md:hidden divide-y divide-gray-100">
                {adminAllRequests.map((req) => (
                  <div key={req.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-800">{req.employee.name}</p>
                        <p className="text-xs text-gray-500">{req.employee.team?.name}</p>
                      </div>
                      <span className={`badge shrink-0 ${
                        req.status === "APPROVED" ? "badge-success" :
                        req.status === "CANCEL_REQUESTED" ? "badge-warning" :
                        req.status === "WITHDRAWN" ? "badge-default" :
                        req.status === "CANCELLED" ? "badge-default" :
                        req.status === "REJECTED" ? "badge-danger" : "badge-default"
                      }`}>
                        {req.status === "APPROVED" ? "승인" : req.status === "CANCEL_REQUESTED" ? "취소신청" :
                          req.status === "WITHDRAWN" ? "철회" : req.status === "CANCELLED" ? "취소" :
                          req.status === "REJECTED" ? "반려" : "대기"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {req.items.map((i) => mergedLeaveTypeLabel(i.leaveType as any, { timeSlot: i.timeSlot ?? null }).mergedName).join("+")} · {formatMDWithDay(req.startDate)}
                      {req.startDate.toDateString() !== req.endDate.toDateString() && ` ~ ${formatMDWithDay(req.endDate)}`}
                      <span className="font-semibold text-slate-700 ml-0.5">{req.totalDays}일</span>
                    </p>
                    <div className="mt-2">
                      {(req.status === "APPROVED" || req.status === "PENDING") && (
                        <AdminCancelButton requestId={req.id} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* PC: 테이블 */}
              <div className="hidden md:block table-scroll">
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
                      <td className="request-list-td type text-[15px] md:text-xs">{req.items.map((i) => mergedLeaveTypeLabel(i.leaveType as any, { timeSlot: i.timeSlot ?? null }).mergedName).join("+")}</td>
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
                          req.status === "WITHDRAWN" ? "badge-default" :
                          req.status === "CANCELLED" ? "badge-default" :
                          req.status === "REJECTED" ? "badge-danger" : "badge-default"
                        }`}>
                          {req.status === "APPROVED" ? "승인" : req.status === "CANCEL_REQUESTED" ? "취소신청" :
                            req.status === "WITHDRAWN" ? "철회" : req.status === "CANCELLED" ? "취소" :
                            req.status === "REJECTED" ? "반려" : "대기"}
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
              {adminAllRequests.length === 0 && (
                <div className="md:hidden px-4 py-8 text-center text-gray-400 text-sm">내역이 없습니다.</div>
              )}
              {adminTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-200">
                  {page > 1 && (
                    <a href={`?tab=leave&view=admin&page=${page - 1}`} className="btn-sm btn-secondary">← 이전</a>
                  )}
                  <span className="text-sm text-gray-500 px-2">{page} / {adminTotalPages}</span>
                  {page < adminTotalPages && (
                    <a href={`?tab=leave&view=admin&page=${page + 1}`} className="btn-sm btn-secondary">다음 →</a>
                  )}
                </div>
              )}
            </div>
          )}

          {view === "all" && (
            <div className="panel">
              {/* 모바일: 카드 */}
              <div className="md:hidden divide-y divide-gray-100">
                {[...actionable,...pastApprovals].map((ap) => {
                  const req = ap.leaveRequest;
                  const statusMap: Record<string,string> = { PENDING:"대기", APPROVED:"승인", REJECTED:"반려" };
                  return (
                    <div key={ap.id} className="px-4 py-3">
                      <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">신청</span>
                      <div className="flex flex-wrap items-start justify-between gap-2 mt-1.5">
                        <div>
                          <p className="font-semibold text-gray-800">{req.employee.name}</p>
                          <p className="text-xs text-gray-500">{req.employee.team?.name}</p>
                        </div>
                        <span className={`badge shrink-0 ${ap.status==="APPROVED"?"badge-success":ap.status==="REJECTED"?"badge-default":"badge-warning"}`}>{statusMap[ap.status]??"대기"}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {req.items.map(i => i.leaveType.name).join("+")} · {formatMDWithDay(req.startDate)}
                        {req.startDate.toDateString()!==req.endDate.toDateString() && ` ~ ${formatMDWithDay(req.endDate)}`}
                        <span className="font-semibold text-slate-700 ml-0.5">{req.totalDays}일</span>
                      </p>
                    </div>
                  );
                })}
                {[...cancelActionable,...pastCancel].map((ap) => {
                  const req = ap.leaveRequest;
                  const statusMap: Record<string,string> = { CANCEL_PENDING:"대기", CANCEL_APPROVED:"취소승인", CANCEL_REJECTED:"취소반려" };
                  return (
                    <div key={`cancel-${ap.id}`} className="px-4 py-3 bg-amber-50/30">
                      <span className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">취소</span>
                      <div className="flex flex-wrap items-start justify-between gap-2 mt-1.5">
                        <div>
                          <p className="font-semibold text-gray-800">{req.employee.name}</p>
                          <p className="text-xs text-gray-500">{req.employee.team?.name}</p>
                        </div>
                        <span className={`badge shrink-0 ${ap.status==="CANCEL_APPROVED"?"badge-success":ap.status==="CANCEL_REJECTED"?"badge-default":"badge-warning"}`}>{statusMap[ap.status]??"대기"}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {req.items.map(i => i.leaveType.name).join("+")} · {formatMDWithDay(req.startDate)}
                        {req.startDate.toDateString()!==req.endDate.toDateString() && ` ~ ${formatMDWithDay(req.endDate)}`}
                        <span className="font-semibold text-slate-700 ml-0.5">{req.totalDays}일</span>
                      </p>
                    </div>
                  );
                })}
                {actionable.length+pastApprovals.length+cancelActionable.length+pastCancel.length===0 && (
                  <div className="px-4 py-8 text-center text-gray-400 text-sm">내역이 없습니다.</div>
                )}
              </div>
              {/* PC: 테이블 */}
              <div className="hidden md:block table-scroll">
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

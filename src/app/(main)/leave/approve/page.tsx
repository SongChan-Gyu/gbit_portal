import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import AdminCancelButton from "./AdminCancelButton";
import LeaveApprovePendingClient from "./LeaveApprovePendingClient";
import StampApproveClient from "@/app/(main)/stamp/approve/StampApproveClient";
import { serializeDates } from "@/lib/serialize";
import { formatMDWithDay } from "@/lib/dateUtils";
import { mergedLeaveTypeLabel } from "@/lib/leaveDisplay";
import { summarizeLeaveApprovals } from "@/lib/leaveApprovalDisplay";
import { leaveApprovalStatusMeta, leaveApproveEntryKindMeta, leaveCancelApprovalStatusMeta, leaveRequestStatusMeta } from "@/lib/statusMeta";
import { formatLeaveDayDisplay } from "@/lib/leaveOverviewTable";
import { isAnnualPoolSourceCode } from "@/lib/annualPoolSource";
import { AFTERNOON_STAMP_THRESHOLD, HEALING_STAMP_THRESHOLD } from "@/lib/stampCard";

const APPROVER_ROLES = ["TEAM_LEAD", "PM", "ADMIN"] as const;
const APPROVE_MAIN_TABS = [
  { key: "leave", label: "휴가" },
  { key: "stamp", label: "스탬프" },
] as const;

type AllocationLite = {
  sourceCode: string;
  totalDays: number;
  usedDays: number;
};

export default async function ApprovePage({
  searchParams,
}: { searchParams: Promise<{ view?: string; tab?: string }> }) {
  const session = await auth();
  const user = session!.user as any;
  const canApprove = APPROVER_ROLES.includes(user.role);

  const self = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  });
  if (self?.employeeType === "EXTERNAL") redirect("/dashboard");

  const params = await searchParams;
  const viewRaw = params.view;
  const tabRaw = params.tab;
  const pageRaw = (params as Record<string, string | undefined>).page;
  const tab = APPROVE_MAIN_TABS.some((t) => t.key === tabRaw) ? (tabRaw as (typeof APPROVE_MAIN_TABS)[number]["key"]) : "leave";
  const viewOptions = canApprove
    ? [
        { key: "pending", label: `처리 대기 (${tab === "stamp" ? "STAMP_PENDING" : "LEAVE_PENDING"})` },
        { key: "all", label: "처리 이력" },
      ]
    : [{ key: "mine", label: "내 요청" }];
  const view = viewOptions.some((v) => v.key === viewRaw) ? viewRaw! : viewOptions[0].key;
  const page = Math.max(1, parseInt(String(pageRaw ?? "1"), 10));
  const PAGE_SIZE = 30;

  // ── 휴가 결재 데이터 (관리자는 본인 결재 건만; 전체 내역은 별도 조회) ──────────────────────────────────
  const approvals = canApprove
    ? await prisma.leaveApproval.findMany({
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
      })
    : [];

  const cancelApprovals = canApprove
    ? await prisma.leaveApproval.findMany({
        where: {
          approverId: user.employeeId,
          ...(view === "pending"
            ? { status: "CANCEL_PENDING" }
            : { status: { in: ["CANCEL_PENDING", "CANCEL_APPROVED", "CANCEL_REJECTED"] } }),
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
      })
    : [];

  // ── 스탬프 결재 데이터 ────────────────────────────────
  const stampRequests = canApprove
    ? await prisma.stampRequest.findMany({
        where: {
          approverId: user.employeeId,
          ...(view === "pending" ? { status: "PENDING" } : {}),
        },
        include: { employee: { include: { team: true } } },
        orderBy: { stampDate: "desc" },
      })
    : [];

  const myLeaveRequests = await prisma.leaveRequest.findMany({
    where: {
      employeeId: user.employeeId,
      status: { in: ["PENDING", "APPROVED", "CANCEL_REQUESTED", "WITHDRAWN", "CANCELLED", "REJECTED"] },
    },
    include: {
      items: { include: { leaveType: true } },
      approvals: { include: { approver: true }, orderBy: { step: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const actionableRaw = approvals.filter(ap => ap.status === "PENDING" && ap.leaveRequest.currentStep === ap.step);
  const actionableEmpIds = [...new Set(actionableRaw.map((ap) => ap.leaveRequest.employeeId))];
  const allocationsByEmployee = new Map<string, AllocationLite[]>();
  if (actionableEmpIds.length > 0) {
    const allAllocs = await prisma.leaveAllocation.findMany({
      where: { employeeId: { in: actionableEmpIds }, isActive: true },
      select: { employeeId: true, sourceCode: true, totalDays: true, usedDays: true },
    });
    for (const a of allAllocs) {
      const arr = allocationsByEmployee.get(a.employeeId) ?? [];
      arr.push({
        sourceCode: a.sourceCode,
        totalDays: Number(a.totalDays),
        usedDays: Number(a.usedDays),
      });
      allocationsByEmployee.set(a.employeeId, arr);
    }
  }
  const stampCouponRemainingByEmployee = new Map<string, number>();
  const healingSlotByEmployee = new Map<string, number>();
  const afternoonSlotByEmployee = new Map<string, number>();
  if (actionableEmpIds.length > 0) {
    const [stampCoupons, healingCards, afternoonCards] = await Promise.all([
      prisma.stampCoupon.groupBy({
        by: ["employeeId"],
        where: { employeeId: { in: actionableEmpIds }, isUsed: false },
        _count: { _all: true },
      }),
      prisma.stampCard.groupBy({
        by: ["employeeId"],
        where: { employeeId: { in: actionableEmpIds }, healingUsed: false, filledCount: { gte: HEALING_STAMP_THRESHOLD } },
        _count: { _all: true },
      }),
      prisma.stampCard.groupBy({
        by: ["employeeId"],
        where: { employeeId: { in: actionableEmpIds }, afternoonUsed: false, filledCount: { gte: AFTERNOON_STAMP_THRESHOLD } },
        _count: { _all: true },
      }),
    ]);
    stampCoupons.forEach((g) => stampCouponRemainingByEmployee.set(g.employeeId, g._count._all));
    healingCards.forEach((g) => healingSlotByEmployee.set(g.employeeId, g._count._all));
    afternoonCards.forEach((g) => afternoonSlotByEmployee.set(g.employeeId, g._count._all));
  }
  const actionable = actionableRaw.map((ap) => {
    const empAllocs = allocationsByEmployee.get(ap.leaveRequest.employeeId) ?? [];
    const couponRemaining = stampCouponRemainingByEmployee.get(ap.leaveRequest.employeeId) ?? 0;
    const healingSlots = healingSlotByEmployee.get(ap.leaveRequest.employeeId) ?? 0;
    const afternoonSlots = afternoonSlotByEmployee.get(ap.leaveRequest.employeeId) ?? 0;
    const itemsWithBalance = ap.leaveRequest.items.map((it) => {
      const requested = Number(it.days);
      if (it.leaveType.requiresStamp) {
        if (it.leaveType.code === "HEALING_DAY") {
          return {
            ...it,
            balanceComment: `${it.leaveType.name} 잔여 ${healingSlots}회 / 신청 1회`,
          };
        }
        if (it.leaveType.code === "PM_RECOG_STAMP") {
          return {
            ...it,
            balanceComment: `${it.leaveType.name} 잔여 ${afternoonSlots}회 / 신청 1회`,
          };
        }
        const needStamp = Number(it.leaveType.stampCount ?? 0);
        return {
          ...it,
          balanceComment: `${it.leaveType.name} 잔여 ${couponRemaining}개 / 신청 ${needStamp}개`,
        };
      }
      const remaining = empAllocs
        .filter((a) => {
          const src = it.leaveType.allocationSourceCode?.trim();
          if (src) return a.sourceCode === src;
          if (!it.leaveType.deductFromBalance) return false;
          return isAnnualPoolSourceCode(a.sourceCode);
        })
        .reduce((sum, a) => sum + (a.totalDays - a.usedDays), 0);
      const hasSource = !!it.leaveType.allocationSourceCode?.trim();
      if (!it.leaveType.deductFromBalance && !hasSource) {
        return {
          ...it,
          balanceComment: `${it.leaveType.name} 잔여 제한없음 / 신청 ${formatLeaveDayDisplay(requested)}일`,
        };
      }
      return {
        ...it,
        balanceComment: `${it.leaveType.name} 잔여 ${formatLeaveDayDisplay(remaining)}일 / 신청 ${formatLeaveDayDisplay(requested)}일`,
      };
    });
    return { ...ap, leaveRequest: { ...ap.leaveRequest, items: itemsWithBalance } };
  });
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
    canApprove && user.role === "ADMIN"
      ? await prisma.leaveRequest.count({
          where: { status: { in: ["PENDING", "APPROVED", "CANCEL_REQUESTED", "WITHDRAWN", "CANCELLED", "REJECTED"] } },
        })
      : 0;
  const adminAllRequests =
    canApprove && user.role === "ADMIN"
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
  const requestKind = leaveApproveEntryKindMeta("REQUEST");
  const cancelKind = leaveApproveEntryKindMeta("CANCEL");

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">결재함</h1>
          <p className="page-subtitle">{canApprove ? "휴가 신청, 취소 신청, 스탬프 요청을 처리합니다." : "내 요청의 진행 상태를 확인합니다."}</p>
        </div>
        {canApprove && totalPending > 0 && (
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
          휴가
          {leavePending > 0 && (
            <span className="ml-1.5 text-xs bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5 font-semibold">
              {leavePending}
            </span>
          )}
        </a>
        {canApprove && (
          <a href={`?tab=stamp&view=${view}`}
            className={`px-4 py-3 md:py-2.5 font-medium border-b-2 -mb-px transition-colors touch-manipulation min-h-[44px] flex items-center active:bg-gray-100 rounded-t-lg ${
              tab === "stamp"
                ? "border-slate-600 text-slate-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            스탬프
            {stampPending > 0 && (
              <span className="ml-1.5 text-xs bg-amber-100 text-amber-600 rounded-full px-1.5 py-0.5 font-semibold">
                {stampPending}
              </span>
            )}
          </a>
        )}
      </div>

      {/* 보기 서브탭 */}
      <div className="flex flex-wrap gap-2 mb-5">
        {viewOptions.map((v) => (
          <a key={v.key} href={`?tab=${tab}&view=${v.key}`}
            className={`btn-sm ${view === v.key ? "btn-primary" : "btn-secondary"}`}>
            {v.label.replace("STAMP_PENDING", String(stampPending)).replace("LEAVE_PENDING", String(leavePending))}
          </a>
        ))}
        {canApprove && user.role === "ADMIN" && tab === "leave" && (
          <a href="?tab=leave&view=admin"
            className={`btn-sm ${view === "admin" ? "btn-primary" : "btn-secondary"}`}>
            전체 휴가 내역(관리자)
          </a>
        )}
      </div>

      {tab === "leave" && view === "mine" && (
        <div className="panel">
          <div className="md:hidden divide-y divide-gray-100">
            {myLeaveRequests.map((req) => (
              <div key={req.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-700">
                    {req.items.map((i) => mergedLeaveTypeLabel(i.leaveType as any, { timeSlot: i.timeSlot ?? null }).mergedName).join("+")}
                  </p>
                  {(() => {
                    const st = leaveRequestStatusMeta(req.status);
                    return <span className={`badge ${st.badge}`}>{st.label}</span>;
                  })()}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {formatMDWithDay(req.startDate)}
                  {req.startDate.toDateString() !== req.endDate.toDateString() && ` ~ ${formatMDWithDay(req.endDate)}`}
                  <span className="ml-1 font-semibold text-slate-700">{req.totalDays}일</span>
                </p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{summarizeLeaveApprovals(req.approvals as any)}</p>
              </div>
            ))}
            {myLeaveRequests.length === 0 && <div className="px-4 py-8 text-center text-gray-400 text-sm">내 요청 내역이 없습니다.</div>}
          </div>
          <div className="hidden md:block table-scroll">
            <table className="data-table request-list-table">
              <thead>
                <tr>
                  <th className="request-list-th type">유형</th>
                  <th className="request-list-th period">기간(일수)</th>
                  <th className="request-list-th status">상태</th>
                  <th className="request-list-th approval">결재 진행</th>
                </tr>
              </thead>
              <tbody>
                {myLeaveRequests.map((req) => (
                  <tr key={req.id}>
                    <td className="request-list-td type text-[15px] md:text-xs">
                      {req.items.map((i) => mergedLeaveTypeLabel(i.leaveType as any, { timeSlot: i.timeSlot ?? null }).mergedName).join("+")}
                    </td>
                    <td className="request-list-td period whitespace-nowrap text-[15px] md:text-xs">
                      {formatMDWithDay(req.startDate)}
                      {req.startDate.toDateString() !== req.endDate.toDateString() && ` ~ ${formatMDWithDay(req.endDate)}`}
                      <span className="font-semibold text-slate-700 ml-1">· {req.totalDays}일</span>
                    </td>
                    <td className="request-list-td status">
                      {(() => {
                        const st = leaveRequestStatusMeta(req.status);
                        return <span className={`badge ${st.badge}`}>{st.label}</span>;
                      })()}
                    </td>
                    <td className="request-list-td approval text-xs text-gray-600">{summarizeLeaveApprovals(req.approvals as any)}</td>
                  </tr>
                ))}
                {myLeaveRequests.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">내 요청 내역이 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 휴가 결재 탭 ─────────────────────────────── */}
      {tab === "leave" && canApprove && (
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
                      {(() => {
                        const st = leaveRequestStatusMeta(req.status);
                        return <span className={`badge shrink-0 ${st.badge}`}>{st.label}</span>;
                      })()}
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
                        {(() => {
                          const st = leaveRequestStatusMeta(req.status);
                          return <span className={`badge ${st.badge}`}>{st.label}</span>;
                        })()}
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
                  return (
                    <div key={ap.id} className="px-4 py-3">
                      <span className={requestKind.badge}>{requestKind.label}</span>
                      <div className="flex flex-wrap items-start justify-between gap-2 mt-1.5">
                        <div>
                          <p className="font-semibold text-gray-800">{req.employee.name}</p>
                          <p className="text-xs text-gray-500">{req.employee.team?.name}</p>
                        </div>
                        {(() => {
                          const st = leaveApprovalStatusMeta(ap.status);
                          return <span className={`badge shrink-0 ${st.badge}`}>{st.label}</span>;
                        })()}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {req.items.map(i => mergedLeaveTypeLabel(i.leaveType as any, { timeSlot: i.timeSlot ?? null }).mergedName).join("+")} · {formatMDWithDay(req.startDate)}
                        {req.startDate.toDateString()!==req.endDate.toDateString() && ` ~ ${formatMDWithDay(req.endDate)}`}
                        <span className="font-semibold text-slate-700 ml-0.5">{req.totalDays}일</span>
                      </p>
                    </div>
                  );
                })}
                {[...cancelActionable,...pastCancel].map((ap) => {
                  const req = ap.leaveRequest;
                  return (
                    <div key={`cancel-${ap.id}`} className={`px-4 py-3 ${cancelKind.rowClass}`}>
                      <span className={cancelKind.badge}>{cancelKind.label}</span>
                      <div className="flex flex-wrap items-start justify-between gap-2 mt-1.5">
                        <div>
                          <p className="font-semibold text-gray-800">{req.employee.name}</p>
                          <p className="text-xs text-gray-500">{req.employee.team?.name}</p>
                        </div>
                        {(() => {
                          const st = leaveCancelApprovalStatusMeta(ap.status);
                          return <span className={`badge shrink-0 ${st.badge}`}>{st.label}</span>;
                        })()}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {req.items.map(i => mergedLeaveTypeLabel(i.leaveType as any, { timeSlot: i.timeSlot ?? null }).mergedName).join("+")} · {formatMDWithDay(req.startDate)}
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
                    return (
                      <tr key={ap.id}>
                        <td className="request-list-td type"><span className={requestKind.badge}>{requestKind.label}</span></td>
                        <td className="request-list-td type"><p className="font-medium text-[15px] md:text-base">{req.employee.name}</p><p className="text-xs text-gray-500">{req.employee.team?.name}</p></td>
                        <td className="request-list-td type text-[15px] md:text-xs">{req.items.map(i => mergedLeaveTypeLabel(i.leaveType as any, { timeSlot: i.timeSlot ?? null }).mergedName).join("+")}</td>
                        <td className="request-list-td period whitespace-nowrap text-[15px] md:text-xs">
                          {formatMDWithDay(req.startDate)}
                          {req.startDate.toDateString()!==req.endDate.toDateString() &&
                            ` ~ ${formatMDWithDay(req.endDate)}`}
                          <span className="font-semibold text-slate-700 ml-1">· {req.totalDays}일</span>
                        </td>
                        <td className="request-list-td status">
                          {(() => {
                            const st = leaveApprovalStatusMeta(ap.status);
                            return <span className={`badge ${st.badge}`}>{st.label}</span>;
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                  {[...cancelActionable,...pastCancel].map((ap) => {
                    const req = ap.leaveRequest;
                    return (
                      <tr key={`cancel-${ap.id}`} className={cancelKind.rowClass}>
                        <td className="request-list-td type"><span className={cancelKind.badge}>{cancelKind.label}</span></td>
                        <td className="request-list-td type"><p className="font-medium text-[15px] md:text-base">{req.employee.name}</p><p className="text-xs text-gray-500">{req.employee.team?.name}</p></td>
                        <td className="request-list-td type text-[15px] md:text-xs">{req.items.map(i => mergedLeaveTypeLabel(i.leaveType as any, { timeSlot: i.timeSlot ?? null }).mergedName).join("+")}</td>
                        <td className="request-list-td period whitespace-nowrap text-[15px] md:text-xs">
                          {formatMDWithDay(req.startDate)}
                          {req.startDate.toDateString()!==req.endDate.toDateString() &&
                            ` ~ ${formatMDWithDay(req.endDate)}`}
                          <span className="font-semibold text-slate-700 ml-1">· {req.totalDays}일</span>
                        </td>
                        <td className="request-list-td status">
                          {(() => {
                            const st = leaveCancelApprovalStatusMeta(ap.status);
                            return <span className={`badge ${st.badge}`}>{st.label}</span>;
                          })()}
                        </td>
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
      {tab === "stamp" && canApprove && (
        <StampApproveClient requests={serializeDates(stampRequests) as any} />
      )}
    </div>
  );
}

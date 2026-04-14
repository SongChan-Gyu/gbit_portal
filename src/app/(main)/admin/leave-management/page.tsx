import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import FiscalYearManager from "@/app/(main)/admin/fiscal-year/FiscalYearManager";
import SchedulerPanel from "@/app/(main)/admin/scheduler/SchedulerPanel";
import LeaveApprovalsTab from "@/app/(main)/admin/leave-management/LeaveApprovalsTab";
import { getFiscalYear } from "@/lib/workdays";
import { fiscalPeriod } from "@/lib/leaveCalc";
import { serializeDates } from "@/lib/serialize";
import { prorateLeaveDaysToFiscalYear } from "@/lib/fiscalLeaveStats";
import { loadTenureMilestoneSourceCodes } from "@/lib/tenureMilestoneSourceCodes";
import {
  aggregateAllocationsByOverviewKey,
  buildOverviewColumns,
  formatLeaveDayDisplay,
  formatOverviewCell,
} from "@/lib/leaveOverviewTable";
import StampGrantTab, { type StampGrantRow } from "@/app/(main)/admin/leave-management/StampGrantTab";
import { ADMIN_LEAVE_EMPLOYEE_STATUSES } from "@/lib/adminEmployeeScope";
import { employeeStatusMeta } from "@/lib/statusMeta";

export const metadata = { title: "휴가 부여·현황 | GBIT Portal" };

export default async function LeaveManagementPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string; fy?: string; empId?: string }> }) {
  const session = await auth();
  const user = session!.user as any;
  if (!["PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const { tab: tabRaw, fy: fyRaw, empId } = await searchParams;
  const tab = tabRaw ?? "overview";
  const fy  = parseInt(fyRaw ?? String(getFiscalYear()));
  const { start: fyRangeStart, end: fyRangeEnd } = fiscalPeriod(fy);

  // ── 탭별 데이터: fiscalYear=선택 FY 이거나, 선택 귀속 구간(KST 5/1~익년 4/30)과 validFrom~validUntil 이 겹치는 할당 → 2025·2026 탭 모두에서 유효기간이 걸치면 동시에 보임 ──
  const employees = await prisma.employee.findMany({
    where: { status: { in: [...ADMIN_LEAVE_EMPLOYEE_STATUSES] } },
    include: {
      team: true,
      leaveAllocations:
        tab === "overview" || tab === "allocations"
          ? {
              where: {
                OR: [
                  { fiscalYear: fy },
                  {
                    AND: [{ validFrom: { lte: fyRangeEnd } }, { validUntil: { gte: fyRangeStart } }],
                  },
                ],
              },
              orderBy: [{ sourceCode: "asc" }],
            }
          : false,
    },
    orderBy: [{ team: { sortOrder: "asc" } }, { name: "asc" }],
  });

  const leaveTypes = await prisma.leaveType.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      allocationSourceCode: true,
      validityBasis: true,
      daysPerUnit: true,
      sortOrder: true,
      carryoverEligible: true,
    },
  });
  const allocationSourceConfigs = await prisma.allocationSourceConfig.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { sourceCode: true, label: true, sortOrder: true, defaultDays: true },
  });
  const tenureMilestoneSourceCodes = await loadTenureMilestoneSourceCodes(prisma);

  /** 승인된 사유형 휴가 일수(귀속 구간 비율 배분) — 할당 used와 별도 */
  const reasonDaysByEmployee = new Map<string, number>();
  if (tab === "overview") {
    const reasonItems = await prisma.leaveRequestItem.findMany({
      where: {
        leaveRequest: { status: "APPROVED" },
        leaveType: { usageCategory: "REASON" },
      },
      select: {
        days: true,
        startDate: true,
        endDate: true,
        leaveRequest: { select: { employeeId: true } },
      },
    });
    for (const it of reasonItems) {
      const empId = it.leaveRequest.employeeId;
      const d = prorateLeaveDaysToFiscalYear(it.startDate, it.endDate, it.days, fy);
      if (d <= 0) continue;
      reasonDaysByEmployee.set(empId, (reasonDaysByEmployee.get(empId) ?? 0) + d);
    }
  }

  const overviewPerEmployeeMaps =
    tab === "overview"
      ? employees.map((emp) => {
          const allocs = ((emp as any).leaveAllocations ?? []).filter((a: any) => a.isActive !== false);
          return aggregateAllocationsByOverviewKey(
            allocs.map((a: any) => ({
              sourceCode: a.sourceCode,
              totalDays: Number(a.totalDays),
              usedDays: Number(a.usedDays),
              note: a.note,
              isActive: a.isActive,
            })),
          );
        })
      : [];
  const overviewColumns =
    tab === "overview" ? buildOverviewColumns(allocationSourceConfigs, overviewPerEmployeeMaps) : [];

  /** 스탬프 수동 부여 탭: 유효기간 없음 — StampCoupon·StampCard 집계만 */
  let stampGrantRows: StampGrantRow[] = [];
  if (tab === "stamps") {
    const stampEmployees = await prisma.employee.findMany({
      where: { status: { in: [...ADMIN_LEAVE_EMPLOYEE_STATUSES] } },
      select: {
        id: true,
        name: true,
        empNo: true,
        status: true,
        team: { select: { name: true } },
        _count: { select: { stampCoupons: true } },
      },
      orderBy: [{ team: { sortOrder: "asc" } }, { name: "asc" }],
    });
    const empIds = stampEmployees.map((e) => e.id);
    const [healingGroups, afternoonGroups] =
      empIds.length === 0
        ? [[], []] as const
        : await Promise.all([
            prisma.stampCard.groupBy({
              by: ["employeeId"],
              where: {
                employeeId: { in: empIds },
                filledCount: { gte: 4 },
                healingUsed: false,
              },
              _count: { _all: true },
            }),
            prisma.stampCard.groupBy({
              by: ["employeeId"],
              where: {
                employeeId: { in: empIds },
                filledCount: { gte: 8 },
                afternoonUsed: false,
              },
              _count: { _all: true },
            }),
          ]);
    const healingMap = new Map(healingGroups.map((g) => [g.employeeId, g._count._all]));
    const afternoonMap = new Map(afternoonGroups.map((g) => [g.employeeId, g._count._all]));
    stampGrantRows = stampEmployees.map((e) => ({
      id: e.id,
      name: e.name,
      empNo: e.empNo,
      teamName: e.team?.name ?? null,
      status: e.status,
      stampCouponCount: e._count.stampCoupons,
      healingEligibleCards: healingMap.get(e.id) ?? 0,
      afternoonEligibleCards: afternoonMap.get(e.id) ?? 0,
    }));
  }

  const TABS = [
    { id: "overview", label: "휴가 현황" },
    { id: "allocations", label: "휴가 할당" },
    { id: "stamps", label: "스탬프 부여" },
    { id: "approvals", label: "전체 결재 내역" },
    { id: "scheduler", label: "자동 스케줄러" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">휴가 부여·현황</h1>
        <p className="page-subtitle">
          {tab === "stamps" ? (
            <>
              스탬프 칸은 <strong>휴가 할당(유효기간)</strong>과 별도이며, 귀속연도와 무관합니다. PM·관리자가 필요 시 칸을
              수동으로 채울 수 있습니다.
            </>
          ) : (
            <>
              선택한 귀속 구간에 태그된(fiscalYear) 할당과, 구간과 유효기간이 겹치는 부여일·입사일 기준 할당을 함께 봅니다.
              이월은 <strong>귀속연도형</strong> 할당만 수동 처리할 수 있습니다.
            </>
          )}
        </p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={
              t.id === "overview" || t.id === "allocations" || t.id === "approvals" || t.id === "stamps"
                ? `?tab=${t.id}&fy=${fy}`
                : `?tab=${t.id}`
            }
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </a>
        ))}
      </div>

      {/* ── 휴가 현황 ─────────────────────────────────── */}
      {tab === "overview" && (
        <div>
          <div className="mb-4 space-y-3">
            <div className="text-sm text-gray-500 space-y-1 max-w-3xl">
              <p>
                귀속연도별 직원별 현황입니다. <strong className="text-gray-600">미초대·초대 발송</strong> 직원도
                포함되며, 초대 전에 휴가 부여를 맞출 수 있습니다.
              </p>
              <ul className="list-disc list-inside text-xs text-gray-500 space-y-0.5">
                <li>
                  <strong className="text-gray-600">자산형</strong>: 위 귀속 구간에 <code className="text-[11px]">fiscalYear</code>가 맞거나, <strong>유효기간이 그 구간과 겹치는</strong> 할당을 합산합니다. 소스별 열은 <strong>AllocationSourceConfig</strong> 순서를 따릅니다.
                </li>
                <li>
                  <strong className="text-gray-600">사유형 사용</strong>: 승인된 사유형(부여 없이 신청) 일수이며, 귀속 구간(5/1~익년 4/30)과 겹치는 날짜 비율로 배분합니다.
                </li>
                <li className="text-gray-400">
                  사유형은 할당 <code className="text-[11px]">usedDays</code>에 반영되지 않으므로, 자산 잔여가 사유 사용으로 마이너스 되는 구조는 아닙니다. (관리자가 사용&gt;부여로 넣은 경우 등에는 자산 잔여가 음수로 보일 수 있습니다.)
                </li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[fy - 1, fy, fy + 1].map((y) => (
                <a key={y} href={`?tab=overview&fy=${y}`}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    y === fy ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}>
                  {y}년도
                </a>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">직원</th>
                  <th className="whitespace-nowrap">팀</th>
                  <th className="whitespace-nowrap" title="해당 귀속연도 할당 합계">자산 부여</th>
                  <th className="whitespace-nowrap" title="할당에서 차감된 일수">자산 사용</th>
                  <th className="whitespace-nowrap" title="자산 부여 − 자산 사용">자산 잔여</th>
                  {overviewColumns.map((col) => (
                    <th
                      key={col.key}
                      className="whitespace-nowrap text-xs max-w-[6.5rem] align-bottom"
                      title={col.label}
                    >
                      <span className="line-clamp-2">{col.label}</span>
                    </th>
                  ))}
                  <th className="whitespace-nowrap" title="사유형 승인 일수(귀속 구간 비율)">사유형 사용</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, idx) => {
                  const allocs = ((emp as any).leaveAllocations ?? []).filter((a: any) => a.isActive !== false);
                  const total  = allocs.reduce((s: number, a: any) => s + a.totalDays, 0);
                  const used   = allocs.reduce((s: number, a: any) => s + a.usedDays,  0);
                  const remain = total - used;
                  const reasonUsed = reasonDaysByEmployee.get(emp.id) ?? 0;
                  const byKey = overviewPerEmployeeMaps[idx];
                  return (
                    <tr key={emp.id}>
                      <td className="font-medium whitespace-nowrap">
                        {emp.name}
                        {emp.status !== "ACTIVE" ? (
                          <span
                            className={`ml-1.5 align-middle text-[10px] px-1.5 py-0.5 rounded ${employeeStatusMeta(emp.status).badge}`}
                          >
                            {employeeStatusMeta(emp.status).label}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap">{emp.team?.name ?? "-"}</td>
                      <td className="font-semibold text-slate-700">{formatLeaveDayDisplay(total)}</td>
                      <td className="text-slate-600">{formatLeaveDayDisplay(used)}</td>
                      <td>
                        <span
                          className={`font-bold ${
                            remain > 0 ? "text-slate-800" : remain < 0 ? "text-rose-600" : "text-gray-400"
                          }`}
                        >
                          {formatLeaveDayDisplay(remain)}
                        </span>
                      </td>
                      {overviewColumns.map((col) => {
                        const cell = formatOverviewCell(byKey?.get(col.key));
                        return (
                          <td
                            key={col.key}
                            className="tabular-nums text-xs text-slate-600"
                            title={cell.title || undefined}
                          >
                            {cell.line}
                          </td>
                        );
                      })}
                      <td className="text-violet-700 tabular-nums">
                        {formatLeaveDayDisplay(reasonUsed)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            일괄 초기화·할당 추가/수정/이월은{" "}
            <a href={`?tab=allocations&fy=${fy}`} className="text-blue-500 hover:underline">
              휴가 할당
            </a>{" "}
            탭에서, 스탬프 칸 수동 부여는{" "}
            <a href={`?tab=stamps&fy=${fy}`} className="text-amber-700 hover:underline">
              스탬프 부여
            </a>{" "}
            탭에서 진행하세요.
          </p>
        </div>
      )}

      {/* ── 휴가 할당 (일괄 초기화 + 직원별 할당 추가/수정/이월/비활성화) ── */}
      {tab === "allocations" && (
        <div>
          <div className="mb-4 space-y-3">
            <p className="text-sm text-gray-500 max-w-3xl">
              <strong className="text-gray-600">미초대·초대 발송</strong> 직원도 목록에 나오며 할당·일괄 초기화 대상에
              포함됩니다. 귀속연도형 휴가는 초기화로 자동 생성·
              <strong className="text-gray-600">부여일·입사일형은 해당 구간에 없을 때만</strong> 보강 생성합니다.{" "}
              <strong className="text-gray-600">근속 마일스톤은 초기화가 아니라 근속 스케줄러에서만</strong> 부여합니다.
              목록은 구간과 유효기간이 겹치는 할당을 모두 표시합니다. 이월은 귀속연도형만 수동 가능합니다.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[fy - 1, fy, fy + 1].map((y) => (
                <a key={y} href={`?tab=allocations&fy=${y}`}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    y === fy ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}>
                  {y}년도
                </a>
              ))}
            </div>
          </div>
          <FiscalYearManager
            employees={serializeDates(employees) as any}
            fiscalYear={fy}
            tenureMilestoneSourceCodes={tenureMilestoneSourceCodes}
            sourceOptions={(() => {
              type Opt = {
                sortOrder: number;
                sourceCode: string;
                label: string;
                validityBasis: string | null;
                defaultDays: number | null;
                carryoverEligible: boolean;
              };
              const m = new Map<string, Opt>();
              for (const s of allocationSourceConfigs) {
                m.set(s.sourceCode, {
                  sortOrder: s.sortOrder,
                  sourceCode: s.sourceCode,
                  label: s.label,
                  validityBasis: null,
                  defaultDays: s.defaultDays != null ? Number(s.defaultDays) : null,
                  carryoverEligible: false,
                });
              }
              for (const t of leaveTypes) {
                if (!t.allocationSourceCode) continue;
                const key = t.allocationSourceCode;
                const cur = m.get(key);
                m.set(key, {
                  sortOrder: cur?.sortOrder ?? t.sortOrder,
                  sourceCode: key,
                  label: cur?.label ?? t.name,
                  validityBasis: t.validityBasis ?? cur?.validityBasis ?? null,
                  defaultDays: cur?.defaultDays != null ? cur.defaultDays : Number(t.daysPerUnit),
                  carryoverEligible: (cur?.carryoverEligible ?? false) || t.carryoverEligible === true,
                });
              }
              return [...m.values()]
                .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
                .map((cfg) => ({
                  value: cfg.sourceCode,
                  label: cfg.label,
                  validityBasis: cfg.validityBasis,
                  defaultDays: cfg.defaultDays,
                  carryoverEligible: cfg.carryoverEligible,
                }));
            })()}
          />
        </div>
      )}

      {/* ── 스탬프 수동 부여 (유효기간 없음, 휴가 할당과 별도) ── */}
      {tab === "stamps" && (
        <div>
          <StampGrantTab rows={stampGrantRows} />
        </div>
      )}

      {/* ── 전체 결재 내역 (PM/ADMIN) ─────────────────────── */}
      {tab === "approvals" && (
        <div>
          <LeaveApprovalsTab
            employees={employees.map((e) => ({ id: e.id, name: e.name, empNo: e.empNo }))}
            leaveTypes={leaveTypes}
            initialFy={fy}
          />
        </div>
      )}

      {/* ── 자동 스케줄러 ────────────────────────────────── */}
      {tab === "scheduler" && (
        <div>
          <SchedulerPanel currentFy={fy} />
        </div>
      )}

    </div>
  );
}

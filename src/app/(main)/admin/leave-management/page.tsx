import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import FiscalYearManager from "@/app/(main)/admin/fiscal-year/FiscalYearManager";
import SchedulerPanel from "@/app/(main)/admin/scheduler/SchedulerPanel";
import LeaveApprovalsTab from "@/app/(main)/admin/leave-management/LeaveApprovalsTab";
import { getFiscalYear } from "@/lib/workdays";
import { serializeDates } from "@/lib/serialize";
import { prorateLeaveDaysToFiscalYear } from "@/lib/fiscalLeaveStats";

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

  // ── 탭별 데이터 (overview·allocations 모두 해당 연도 할당 포함) ──
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: {
      team: true,
      leaveAllocations: (tab === "overview" || tab === "allocations")
        ? { where: { fiscalYear: fy }, orderBy: { sourceCode: "asc" } }
        : false,
    },
    orderBy: [{ team: { sortOrder: "asc" } }, { name: "asc" }],
  });

  const leaveTypes = await prisma.leaveType.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, name: true, allocationSourceCode: true },
  });
  const allocationSourceConfigs = await prisma.allocationSourceConfig.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { sourceCode: true, label: true },
  });

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

  const TABS = [
    { id: "overview", label: "휴가 현황" },
    { id: "allocations", label: "휴가 할당" },
    { id: "approvals", label: "전체 결재 내역" },
    { id: "scheduler", label: "자동 스케줄러" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">휴가 부여·현황</h1>
        <p className="page-subtitle">귀속연도별 잔여·사용 현황, 일괄 초기화·할당 조정·이월, 자동 스케줄러·결재 내역을 한 곳에서 관리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={
              t.id === "overview" || t.id === "allocations" || t.id === "approvals"
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
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-500 space-y-1 max-w-3xl">
              <p>귀속연도별 직원별 현황입니다.</p>
              <ul className="list-disc list-inside text-xs text-gray-500 space-y-0.5">
                <li>
                  <strong className="text-gray-600">자산형</strong>: 해당 연도 <strong>휴가 할당</strong>의 부여·사용·잔여 합계입니다. 사유형 사용은 여기에 포함되지 않습니다.
                </li>
                <li>
                  <strong className="text-gray-600">사유형 사용</strong>: 승인된 사유형(부여 없이 신청) 일수이며, 귀속 구간(5/1~익년 4/30)과 겹치는 날짜 비율로 배분합니다.
                </li>
                <li className="text-gray-400">
                  사유형은 할당 <code className="text-[11px]">usedDays</code>에 반영되지 않으므로, 자산 잔여가 사유 사용으로 마이너스 되는 구조는 아닙니다. (관리자가 사용&gt;부여로 넣은 경우 등에는 자산 잔여가 음수로 보일 수 있습니다.)
                </li>
              </ul>
            </div>
            <div className="flex gap-1.5">
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
                  <th className="whitespace-nowrap" title="사유형 승인 일수(귀속 구간 비율)">사유형 사용</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const allocs = ((emp as any).leaveAllocations ?? []).filter((a: any) => a.isActive !== false);
                  const total  = allocs.reduce((s: number, a: any) => s + a.totalDays, 0);
                  const used   = allocs.reduce((s: number, a: any) => s + a.usedDays,  0);
                  const remain = total - used;
                  const reasonUsed = reasonDaysByEmployee.get(emp.id) ?? 0;
                  return (
                    <tr key={emp.id}>
                      <td className="font-medium whitespace-nowrap">{emp.name}</td>
                      <td className="whitespace-nowrap">{emp.team?.name ?? "-"}</td>
                      <td className="font-semibold text-slate-700">{total.toFixed(1)}</td>
                      <td className="text-slate-600">{used.toFixed(1)}</td>
                      <td>
                        <span
                          className={`font-bold ${
                            remain > 0 ? "text-slate-800" : remain < 0 ? "text-rose-600" : "text-gray-400"
                          }`}
                        >
                          {remain.toFixed(1)}
                        </span>
                      </td>
                      <td className="text-violet-700 tabular-nums">
                        {reasonUsed > 0 ? reasonUsed.toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            일괄 초기화·할당 추가/수정/이월은 <a href={`?tab=allocations&fy=${fy}`} className="text-blue-500 hover:underline">휴가 할당</a> 탭에서 진행하세요.
          </p>
        </div>
      )}

      {/* ── 휴가 할당 (일괄 초기화 + 직원별 할당 추가/수정/이월/비활성화) ── */}
      {tab === "allocations" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              귀속연도 일괄 초기화, 직원별 할당 추가·수정·이월·비활성화를 한 화면에서 처리합니다.
            </p>
            <div className="flex gap-1.5">
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
            sourceOptions={Array.from(
              new Map(
                [
                  ...allocationSourceConfigs.map((s) => [s.sourceCode, s.label] as const),
                  ...leaveTypes
                    .filter((t) => !!t.allocationSourceCode)
                    .map((t) => [String(t.allocationSourceCode), t.name] as const),
                ],
              ).entries(),
            ).map(([value, label]) => ({ value, label }))}
          />
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

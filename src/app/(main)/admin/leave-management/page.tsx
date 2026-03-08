import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import FiscalYearManager from "@/app/(main)/admin/fiscal-year/FiscalYearManager";
import SchedulerPanel from "@/app/(main)/admin/scheduler/SchedulerPanel";
import LeaveApprovalsTab from "@/app/(main)/admin/leave-management/LeaveApprovalsTab";
import JejuSettingsTab from "@/app/(main)/admin/leave-management/JejuSettingsTab";
import { getFiscalYear } from "@/lib/workdays";
import { isWelfareDept } from "@/lib/jeju";
import { serializeDates } from "@/lib/serialize";

export const metadata = { title: "휴가 관리 | HRM" };

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
    select: { id: true, code: true, name: true },
  });

  const currentUser = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true },
  });
  const showJejuTab = user.role === "PM" || user.role === "ADMIN" || isWelfareDept(currentUser);

  const TABS = [
    { id: "overview", label: "휴가 현황" },
    { id: "allocations", label: "휴가 할당" },
    { id: "approvals", label: "전체 결재 내역" },
    { id: "scheduler", label: "자동 스케줄러" },
    ...(showJejuTab ? [{ id: "jeju", label: "제주 숙소" }] : []),
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">휴가 관리</h1>
        <p className="page-subtitle">귀속연도별 휴가 현황, 일괄 초기화·할당 추가/수정/이월/비활성화, 자동 스케줄러를 한 곳에서 관리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={
              t.id === "overview" || t.id === "allocations" || t.id === "approvals"
                ? `?tab=${t.id}&fy=${fy}`
                : t.id === "jeju"
                ? "?tab=jeju"
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
            <p className="text-sm text-gray-500">귀속연도별 전체 직원 휴가 부여·사용·잔여 현황입니다.</p>
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
                  <th className="whitespace-nowrap">부여</th>
                  <th className="whitespace-nowrap">사용</th>
                  <th className="whitespace-nowrap">잔여</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const allocs = ((emp as any).leaveAllocations ?? []).filter((a: any) => a.isActive !== false);
                  const total  = allocs.reduce((s: number, a: any) => s + a.totalDays, 0);
                  const used   = allocs.reduce((s: number, a: any) => s + a.usedDays,  0);
                  return (
                    <tr key={emp.id}>
                      <td className="font-medium whitespace-nowrap">{emp.name}</td>
                      <td className="whitespace-nowrap">{emp.team?.name ?? "-"}</td>
                      <td className="font-semibold text-slate-700">{total}</td>
                      <td className="text-slate-600">{used}</td>
                      <td>
                        <span className={`font-bold ${(total-used) > 0 ? "text-slate-800" : "text-gray-400"}`}>
                          {(total-used).toFixed(1)}
                        </span>
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
          <FiscalYearManager employees={serializeDates(employees) as any} fiscalYear={fy} />
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

      {/* ── 제주 숙소 (복지부·PM·ADMIN) ───────────────────── */}
      {tab === "jeju" && showJejuTab && (
        <div>
          <JejuSettingsTab />
        </div>
      )}
    </div>
  );
}

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import type { LeaveRequest, Employee, LeaveRequestItem, LeaveType } from "@prisma/client";
import Link from "next/link";
import { getFiscalYear } from "@/lib/workdays";
import { Bell, Calendar, ChevronLeft, ChevronRight, Home } from "lucide-react";
import { isWelfareDept } from "@/lib/jeju";
import { formatMDWithDay } from "@/lib/dateUtils";

const STATUS_BADGE: Record<string, string> = {
  PENDING: "badge-warning", APPROVED: "badge-success",
  REJECTED: "badge-danger", CANCELLED: "badge-default",
};
const STATUS_KO: Record<string, string> = {
  PENDING: "대기", APPROVED: "승인", REJECTED: "반려", CANCELLED: "취소",
};

const DAYS_KO = ["일","월","화","수","목","금","토"];

function getMonthDates(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  const m = String(month).padStart(2, "0");
  return Array.from({ length: last }, (_, i) => `${year}-${m}-${String(i + 1).padStart(2, "0")}`);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ teamY?: string; teamM?: string }>;
}) {
  const session = await auth();
  const user = session!.user as any;
  const fy = getFiscalYear();
  const now = new Date();
  const params = await searchParams;
  let teamCalYear = params.teamY ? parseInt(params.teamY, 10) : now.getFullYear();
  let teamCalMonth = params.teamM ? parseInt(params.teamM, 10) : now.getMonth() + 1;
  if (teamCalMonth < 1) {
    teamCalMonth += 12;
    teamCalYear -= 1;
  } else if (teamCalMonth > 12) {
    teamCalMonth -= 12;
    teamCalYear += 1;
  }
  const prevMonth = teamCalMonth === 1 ? { y: teamCalYear - 1, m: 12 } : { y: teamCalYear, m: teamCalMonth - 1 };
  const nextMonth = teamCalMonth === 12 ? { y: teamCalYear + 1, m: 1 } : { y: teamCalYear, m: teamCalMonth + 1 };

  const [allocations, pendingReqs, stamps, employee, recentRequests] = await Promise.all([
    prisma.leaveAllocation.findMany({
      where: {
        employeeId: user.employeeId,
        isActive: true,
        validFrom:  { lte: now },
        validUntil: { gte: now },
      },
      orderBy: [{ fiscalYear: "desc" }, { sourceCode: "asc" }],
    }),
    prisma.leaveRequest.count({ where: { employeeId: user.employeeId, status: "PENDING" } }),
    prisma.stampCoupon.count({ where: { employeeId: user.employeeId, isUsed: false } }),
    prisma.employee.findUnique({ where: { id: user.employeeId }, include: { team: { include: { employees: true } } } }),
    prisma.leaveRequest.findMany({
      where: { employeeId: user.employeeId },
      include: { items: { include: { leaveType: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const welfare = isWelfareDept(employee);
  const jejuPendingCount = welfare ? await prisma.jejuAccommodation.count({ where: { status: "PENDING" } }) : 0;

  // 부여 = 전체 부여(연차+특별휴가+돌봄 등). 잔여 연차 = 연차(기본+근속가산+이월)만
  const ANNUAL_ONLY_SOURCES = new Set(["BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER"]);
  const annualAllocs = allocations.filter((a) => ANNUAL_ONLY_SOURCES.has(a.sourceCode));
  const totalGranted = allocations.reduce((s, a) => s + a.totalDays, 0);  // 전체 부여
  const annualUsed   = annualAllocs.reduce((s, a) => s + a.usedDays, 0);  // 연차 사용
  const totalRemain  = annualAllocs.reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0); // 잔여 연차
  const baseDays   = annualAllocs.find((a) => a.sourceCode === "BASE_ANNUAL")?.totalDays ?? 0;
  const tenureDays = annualAllocs.find((a) => a.sourceCode === "TENURE_BONUS")?.totalDays ?? 0;
  const carryDays  = annualAllocs.find((a) => a.sourceCode === "CARRYOVER")?.totalDays ?? 0;
  const annualBreakdownLabel = `연차 (기본연차 ${baseDays} 근속가산 ${tenureDays} 이월 ${carryDays})`;
  const annualMergedForDisplay = annualAllocs.length > 0 ? {
    id: "annual-merged",
    label: annualBreakdownLabel,
    totalDays: annualAllocs.reduce((s, a) => s + a.totalDays, 0),
    usedDays: annualUsed,
  } : null;
  const otherAllocs = allocations.filter((a) => !ANNUAL_ONLY_SOURCES.has(a.sourceCode));
  const allocationsForDetail = [
    ...(annualMergedForDisplay ? [annualMergedForDisplay] : []),
    ...otherAllocs,
  ];

  let approvalPending = 0;
  let stampPending = 0;
  let pendingStamps: any[] = [];
  if (["TEAM_LEAD","PM","ADMIN"].includes(user.role)) {
    [approvalPending, stampPending] = await Promise.all([
      prisma.leaveApproval.count({ where: { approverId: user.employeeId, status: "PENDING" } }),
      prisma.stampRequest.count({ where: { approverId: user.employeeId, status: "PENDING" } }),
    ]);
    if (stampPending > 0) {
      pendingStamps = await prisma.stampRequest.findMany({
        where: { approverId: user.employeeId, status: "PENDING" },
        include: { employee: true },
        take: 3,
      });
    }
  }

  // 팀 주간 일정 (팀이 있는 모든 직원)
  // 팀 월간 일정: 팀 소속이면 팀만, ADMIN/PM이면 팀 없어도 전사 일정 표시
  type MonthData = { year: number; month: number; dates: string[]; byDay: Record<string, { name: string; status: string }[]> };
  let teamMonthData: MonthData | null = null;
  const showTeamCalendar = employee?.teamId || (user.role === "ADMIN" || user.role === "PM");
  if (showTeamCalendar) {
    const year = teamCalYear;
    const month = teamCalMonth;
    const dates = getMonthDates(year, month);
    const first = dates[0];
    const last = dates[dates.length - 1];
    const firstDt = new Date(`${first}T00:00:00.000Z`);
    const lastDt = new Date(`${last}T23:59:59.999Z`);
    type LeaveRow = LeaveRequest & { employee: Employee; items: (LeaveRequestItem & { leaveType: LeaveType })[] };
    const leaves: LeaveRow[] = await prisma.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        ...(employee?.teamId ? { employee: { teamId: employee.teamId } } : { employee: { status: "ACTIVE" } }),
        startDate: { lte: lastDt },
        endDate: { gte: firstDt },
      },
      include: { employee: true, items: { include: { leaveType: true } } },
    });
    const byDay: Record<string, { name: string; status: string }[]> = {};
    for (const req of leaves) {
      for (const item of req.items) {
        const s = new Date(item.startDate);
        const e = new Date(item.endDate);
        const cur = new Date(s);
        while (cur <= e) {
          const ds = cur.toISOString().slice(0, 10);
          if (dates.includes(ds)) {
            const status = item.leaveType.isHalf && item.leaveType.isAmOnly ? "오전" : item.leaveType.isHalf && item.leaveType.isPmOnly ? "오후" : "휴가";
            if (!byDay[ds]) byDay[ds] = [];
            const name = req.employee?.name ?? "";
            const ex = byDay[ds].find((x) => x.name === name);
            if (!ex) byDay[ds].push({ name, status });
            else ex.status = ex.status === status ? status : "휴가";
          }
          cur.setDate(cur.getDate() + 1);
        }
      }
    }
    teamMonthData = { year, month, dates, byDay };
  }

  return (
    <div className="space-y-4">
      {/* 상단: 직원 정보 + 연차 요약 */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <span className="panel-title">{employee?.name}</span>
            <span className="text-gray-500 text-sm md:text-xs ml-2">
              {employee?.team?.name} · {employee?.position}
            </span>
          </div>
          <span className="badge badge-blue">현재 귀속 {fy}년도</span>
        </div>
        <div className="panel-body">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <div className="stat-card col-span-1">
              <div className="stat-num">{totalRemain.toFixed(1)}</div>
              <div className="stat-label">잔여 연차</div>
            </div>
            <div className="stat-card col-span-1">
              <div className="stat-num text-gray-600">{annualUsed.toFixed(1)}</div>
              <div className="stat-label">연차 사용</div>
            </div>
            <div className="stat-card col-span-1">
              <div className="stat-num text-gray-600">{totalGranted.toFixed(0)}</div>
              <div className="stat-label">부여</div>
            </div>
            <div className="stat-card col-span-1">
              <div className="stat-num text-amber-600">{stamps}</div>
              <div className="stat-label">스탬프</div>
            </div>
            <div className="stat-card col-span-1">
              <div className="stat-num text-orange-600">{pendingReqs}</div>
              <div className="stat-label">신청 대기</div>
            </div>
            {["TEAM_LEAD","PM","ADMIN"].includes(user.role) && (
              <div className="stat-card col-span-1">
                <div className={`stat-num ${(approvalPending + stampPending) > 0 ? "text-red-600" : "text-gray-400"}`}>
                  {approvalPending + stampPending}
                </div>
                <div className="stat-label">결재 대기</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 결재 대기 알림 */}
      {(approvalPending > 0 || stampPending > 0 || (welfare && jejuPendingCount > 0)) && (
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-orange-500" />
              <span className="panel-title">처리 필요 항목</span>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {approvalPending > 0 && (
              <Link href="/leave/approve?tab=leave"
                className="flex items-center justify-between px-4 py-3 md:py-2.5 hover:bg-slate-50 transition-colors text-[15px] md:text-[13px] touch-manipulation">
                <span className="text-gray-700">
                  휴가 결재 대기 <span className="font-semibold text-orange-600">{approvalPending}건</span> 처리가 필요합니다
                </span>
                <ChevronRight size={18} className="text-gray-400 shrink-0 md:w-3.5 md:h-3.5" />
              </Link>
            )}
            {pendingStamps.length > 0 && (
              <Link href="/leave/approve?tab=stamp"
                className="flex items-center justify-between px-4 py-3 md:py-2.5 hover:bg-slate-50 transition-colors text-[15px] md:text-[13px] touch-manipulation">
                <span className="text-gray-700">
                  스탬프 승인 대기 <span className="font-semibold text-amber-600">{stampPending}건</span> 처리가 필요합니다
                </span>
                <ChevronRight size={18} className="text-gray-400 shrink-0 md:w-3.5 md:h-3.5" />
              </Link>
            )}
            {welfare && jejuPendingCount > 0 && (
              <Link href="/jeju"
                className="flex items-center justify-between px-4 py-3 md:py-2.5 hover:bg-slate-50 transition-colors text-[15px] md:text-[13px] touch-manipulation">
                <span className="text-gray-700">
                  제주도 숙소 신청 대기 <span className="font-semibold text-teal-600">{jejuPendingCount}건</span> 처리가 필요합니다
                </span>
                <ChevronRight size={18} className="text-gray-400 shrink-0 md:w-3.5 md:h-3.5" />
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* 연차 상세 */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">연차 상세 ({fy}년도)</span>
            <Link href="/leave/my" className="text-sm md:text-xs text-slate-600 hover:underline touch-manipulation">전체보기</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {allocationsForDetail.length === 0 && (
              <p className="px-4 py-4 text-xs text-gray-400">할당 정보가 없습니다.</p>
            )}
            {allocationsForDetail.map((a) => {
              const totalDays = "totalDays" in a ? a.totalDays : 0;
              const usedDays  = "usedDays" in a ? a.usedDays : 0;
              const remain = totalDays - usedDays;
              const pct = totalDays > 0 ? (usedDays / totalDays) * 100 : 0;
              const label = "label" in a ? a.label : "";
              return (
                <div key={a.id} className="px-4 py-3 md:py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[15px] md:text-[13px] text-gray-700 font-medium">{label}</span>
                    <span className="text-sm md:text-xs text-gray-500">
                      <span className="font-semibold text-blue-700">{remain.toFixed(1)}</span> / {totalDays}일
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 최근 신청 내역 */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">최근 신청</span>
            <Link href="/leave/my" className="text-sm md:text-xs text-slate-600 hover:underline touch-manipulation">전체보기</Link>
          </div>
          {recentRequests.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-gray-400 mb-3">신청 내역이 없습니다.</p>
              <Link href="/leave/apply" className="btn-primary btn-sm">휴가 신청</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentRequests.map((req) => (
                <div key={req.id} className="px-4 py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-gray-800">
                      {req.items.map((i) => i.leaveType.name).join(" + ")}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <Calendar size={11} className="inline mr-1" />
                      {formatMDWithDay(req.startDate)}
                      {req.startDate.toDateString() !== req.endDate.toDateString()
                        && ` ~ ${formatMDWithDay(req.endDate)}`}
                      <span className="mx-1.5">·</span>
                      {req.totalDays}일
                    </p>
                  </div>
                  <span className={`badge ${STATUS_BADGE[req.status]}`}>{STATUS_KO[req.status]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 팀 월간 일정 (한 달만 표시, 이전/다음 달은 클릭으로 이동) */}
      {teamMonthData && (
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-blue-500" />
              <span className="panel-title">
                {employee?.teamId ? "팀 월간 일정" : "전체 월간 일정"}
              </span>
            </div>
            <Link href="/team-schedule?view=month" className="text-sm text-slate-600 hover:underline">전체보기</Link>
          </div>
          <div className="panel-body">
            <div className="flex items-center justify-between gap-2 mb-3">
              <Link
                href={`/dashboard?teamY=${prevMonth.y}&teamM=${prevMonth.m}`}
                className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 p-1.5 rounded hover:bg-gray-100 shrink-0"
              >
                <ChevronLeft size={18} /> 이전 달
              </Link>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-gray-800">
                  {teamMonthData.year}년 {teamMonthData.month}월
                </span>
                {(teamCalYear !== now.getFullYear() || teamCalMonth !== now.getMonth() + 1) && (
                  <Link href="/dashboard" className="text-xs text-blue-600 hover:underline shrink-0">이번 달</Link>
                )}
              </div>
              <Link
                href={`/dashboard?teamY=${nextMonth.y}&teamM=${nextMonth.m}`}
                className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 p-1.5 rounded hover:bg-gray-100 shrink-0"
              >
                다음 달 <ChevronRight size={18} />
              </Link>
            </div>
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 max-w-3xl mx-auto">
              <div className="grid grid-cols-7 gap-1.5 text-center">
                {DAYS_KO.map((d) => (
                  <div key={d} className="text-xs sm:text-sm font-semibold text-gray-500 py-1">{d}</div>
                ))}
                {(() => {
                  const { year, month, dates, byDay } = teamMonthData;
                  const firstDow = new Date(year, month - 1, 1).getDay();
                  const pad = Array(firstDow).fill(null);
                  const cells = [...pad, ...dates.map((d) => d)];
                  return cells.map((dateStr, i) => {
                    if (!dateStr) return <div key={`e-${i}`} />;
                    const list = byDay[dateStr] ?? [];
                    const hasLeave = list.length > 0;
                    const isToday = dateStr === now.toISOString().slice(0, 10);
                    return (
                      <div
                        key={dateStr}
                        className={`min-h-[64px] sm:min-h-[72px] flex flex-col items-center justify-start rounded-lg text-sm p-1.5 ${
                          isToday ? "ring-2 ring-blue-400 bg-blue-50 font-bold text-blue-700" : "text-gray-700"
                        } ${hasLeave ? "bg-red-50/80" : ""}`}
                      >
                        <span className="text-sm sm:text-base">{dateStr.slice(8, 10)}</span>
                        {hasLeave && (
                          <div className="mt-1 space-y-0.5 w-full overflow-hidden min-w-0">
                            {list.map((x, j) => (
                              <div key={j} className="text-xs text-left truncate text-red-700 font-medium" title={`${x.name} ${x.status}`}>
                                {x.name} {x.status}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

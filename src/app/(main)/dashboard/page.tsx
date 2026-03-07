import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import Link from "next/link";
import { getFiscalYear } from "@/lib/workdays";
import { Bell, Calendar, ChevronRight, CalendarRange, Home } from "lucide-react";
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

function getWeekRange(base: Date) {
  const d = new Date(base);
  const day = d.getDay(); // 0=Sun
  const mon = new Date(d); mon.setDate(d.getDate() - ((day + 6) % 7)); mon.setHours(0,0,0,0);
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4); fri.setHours(23,59,59,999);
  return { mon, fri };
}

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user as any;
  const fy = getFiscalYear();
  const now = new Date();

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
  const { mon, fri } = getWeekRange(now);
  let weekDays: Date[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    weekDays.push(d);
  }

  let teamWeekData: { member: { id: string; name: string }; status: (string | null)[] }[] = [];

  if (employee?.teamId) {
    const teamMembers = employee.team?.employees ?? [];

    const weekLeaves = await prisma.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        employee: { teamId: employee.teamId },
        startDate: { lte: fri },
        endDate:   { gte: mon },
      },
      include: { employee: true, items: { include: { leaveType: true } } },
    });

    teamWeekData = teamMembers
      .filter((m: any) => m.status === "ACTIVE")
      .map((m: any) => {
        const myLeaves = weekLeaves.filter((r: any) => r.employeeId === m.id);
        const statusPerDay = weekDays.map((d) => {
          const active = myLeaves.filter((r: any) => {
            const s = new Date(r.startDate); s.setHours(0,0,0,0);
            const e = new Date(r.endDate);   e.setHours(23,59,59,999);
            return d >= s && d <= e;
          });
          if (active.length === 0) return null;
          const hasAmOnly = active.some((r: any) => r.items.some((it: any) => it.leaveType.isAmOnly));
          const hasPmOnly = active.some((r: any) => r.items.some((it: any) => it.leaveType.isPmOnly));
          const hasFull   = active.some((r: any) => r.items.some((it: any) => !it.leaveType.isAmOnly && !it.leaveType.isPmOnly));
          if (hasFull) return "휴가";
          if (hasAmOnly && hasPmOnly) return "휴가";
          if (hasAmOnly) return "오전";
          if (hasPmOnly) return "오후";
          return "휴가";
        });
        return { member: { id: m.id, name: m.name }, status: statusPerDay };
      });
  }

  const hasAnyWeekLeave = teamWeekData.some(t => t.status.some(s => s !== null));

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
            {allocations.length === 0 && (
              <p className="px-4 py-4 text-xs text-gray-400">할당 정보가 없습니다.</p>
            )}
            {allocations.map((a) => {
              const remain = a.totalDays - a.usedDays;
              const pct    = a.totalDays > 0 ? (a.usedDays / a.totalDays) * 100 : 0;
              return (
                <div key={a.id} className="px-4 py-3 md:py-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[15px] md:text-[13px] text-gray-700 font-medium">{a.label}</span>
                    <span className="text-sm md:text-xs text-gray-500">
                      <span className="font-semibold text-blue-700">{remain.toFixed(1)}</span> / {a.totalDays}일
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

      {/* 팀 주간 일정 */}
      {employee?.teamId && (
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <CalendarRange size={14} className="text-blue-500" />
              <span className="panel-title">팀 주간 일정</span>
              <span className="text-sm md:text-xs text-gray-500">
                {formatMDWithDay(mon)} ~ {formatMDWithDay(fri)}
              </span>
            </div>
            <span className="text-xs text-gray-400">{employee.team?.name}</span>
          </div>
          {!hasAnyWeekLeave ? (
            <div className="px-4 py-6 text-center text-xs text-gray-400">이번 주 팀원 휴가 없음</div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-20">팀원</th>
                    {weekDays.map((d, i) => (
                      <th key={i} className="text-center min-w-[56px]">
                        <span className={d.toDateString() === now.toDateString() ? "text-blue-600 font-bold" : ""}>
                          {d.getDate()}<span className="text-gray-400 font-normal">({DAYS_KO[d.getDay()]})</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamWeekData.map(({ member, status }) => (
                    <tr key={member.id} className={member.id === user.employeeId ? "bg-blue-50/40" : ""}>
                      <td className="font-medium text-gray-800 whitespace-nowrap">
                        {member.name}
                        {member.id === user.employeeId && <span className="ml-1 text-[10px] text-blue-500">나</span>}
                      </td>
                      {status.map((s, i) => (
                        <td key={i} className="text-center">
                          {s === "휴가" && (
                            <span className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">휴가</span>
                          )}
                          {s === "오전" && (
                            <span className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-600 font-medium">오전↑</span>
                          )}
                          {s === "오후" && (
                            <span className="inline-block text-[11px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium">오후↓</span>
                          )}
                          {s === null && <span className="text-gray-200 text-sm">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

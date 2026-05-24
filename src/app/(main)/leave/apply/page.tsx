import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getFiscalYear } from "@/lib/workdays";
import { redirect } from "next/navigation";
import { formatYMD, holidayDateToYmd } from "@/lib/dateUtils";
import { monthKeyFromYmd } from "@/lib/halfdayPolicy";
import LeaveApplyForm from "./LeaveApplyForm";
import LeaveApplyFeatureTour from "./LeaveApplyFeatureTour";
import HalfPoolKpiCell from "./HalfPoolKpiCell";
import LeaveApplyHelpButton from "./LeaveApplyHelpButton";
import { serializeDates } from "@/lib/serialize";
import { countAfternoonEligible, countHealingEligible } from "@/lib/stampCard";
import { isAnnualPoolSourceCode } from "@/lib/annualPoolSource";

export default async function LeaveApplyPage() {
  const session = await auth();
  const user = session!.user as any;
  const fy = getFiscalYear();
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const self = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  });
  if (self?.employeeType === "EXTERNAL") redirect("/dashboard");

  const [leaveTypes, allocations, employee, holidays, totalStamps, afternoonStampSlots, healingStampSlots] =
    await Promise.all([
      prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      // 신청 화면은 귀속연도가 아니라 유효기간 겹침으로만 판단 — 익년도 부여도 포함해 전부 로드
      prisma.leaveAllocation.findMany({
        where: { employeeId: user.employeeId, isActive: true },
        orderBy: [{ validFrom: "desc" }, { sourceCode: "asc" }],
      }),
      prisma.employee.findUnique({ where: { id: user.employeeId }, include: { team: true } }),
      prisma.holiday.findMany({ orderBy: { date: "asc" } }),
      prisma.stampCoupon.count({ where: { employeeId: user.employeeId } }),
      countAfternoonEligible(prisma, user.employeeId),
      countHealingEligible(prisma, user.employeeId),
    ]);

  /** 상단 KPI: usageCategory=ASSET 메타 기반 + 정책성 fallback */
  const assetSourceCodes = new Set(
    leaveTypes
      .filter((lt) => lt.isActive && lt.usageCategory === "ASSET" && !!lt.allocationSourceCode)
      .map((lt) => lt.allocationSourceCode!)
  );
  const totalAssetRemain = allocations
    .filter((a) => assetSourceCodes.has(a.sourceCode) || isAnnualPoolSourceCode(a.sourceCode) || a.sourceCode === "DUTY_DEPT")
    .filter((a) => new Date(a.validFrom) <= dayEnd && new Date(a.validUntil) >= dayStart)
    .reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0);

  // 하프데이 / 힐링데이(하프대체) — 월별 집계 (신청일 기준, API와 동일)
  const halfDayType = leaveTypes.find((t) => t.code === "PM_HALF_MONTH");
  const halfReplaceType = leaveTypes.find((t) => t.code === "HEALING_DAY_HALF_REPLACE");

  const [halfDayItems, healingItems] = await Promise.all([
    halfDayType
      ? prisma.leaveRequestItem.findMany({
          where: {
            leaveTypeId: halfDayType.id,
            leaveRequest: {
              employeeId: user.employeeId,
              status: { notIn: ["CANCELLED", "WITHDRAWN", "REJECTED"] },
            },
          },
          select: { startDate: true, leaveRequest: { select: { status: true } } },
        })
      : Promise.resolve([]),
    halfReplaceType
      ? prisma.leaveRequestItem.findMany({
          where: {
            leaveTypeId: halfReplaceType.id,
            leaveRequest: {
              employeeId: user.employeeId,
              status: { notIn: ["CANCELLED", "WITHDRAWN", "REJECTED"] },
            },
          },
          select: { startDate: true, leaveRequest: { select: { status: true } } },
        })
      : Promise.resolve([]),
  ]);

  const halfDayUsedByMonth: Record<string, number> = {};
  const approvedHalfMonthKeys: string[] = [];
  const approvedHalfMonthSet = new Set<string>();
  for (const row of halfDayItems) {
    const mk = monthKeyFromYmd(holidayDateToYmd(row.startDate));
    halfDayUsedByMonth[mk] = (halfDayUsedByMonth[mk] ?? 0) + 1;
    if (row.leaveRequest.status === "APPROVED") approvedHalfMonthSet.add(mk);
  }
  approvedHalfMonthKeys.push(...approvedHalfMonthSet);

  const healingHalfReplaceUsedByMonth: Record<string, number> = {};
  const approvedHealingHalfReplaceMonthKeys: string[] = [];
  for (const row of healingItems) {
    const mk = monthKeyFromYmd(holidayDateToYmd(row.startDate));
    healingHalfReplaceUsedByMonth[mk] = (healingHalfReplaceUsedByMonth[mk] ?? 0) + 1;
    if (row.leaveRequest.status === "APPROVED") approvedHealingHalfReplaceMonthKeys.push(mk);
  }

  const todayYmd = holidayDateToYmd(now);
  const currentMonthKey = monthKeyFromYmd(todayYmd);

  return (
    <div className="max-w-2xl">
      {/* 페이지 헤더 */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">휴가 신청</h1>
          <p className="page-subtitle">
            {employee?.name} · {employee?.team?.name}
            <span className="text-gray-400 font-normal"> · 신청 일정과 유효기간이 맞는 부여만 집계·차감</span>
          </p>
        </div>
        <LeaveApplyHelpButton />
      </div>

      {/* 사용 가능 자산 요약 (공가·병가 미포함) */}
      <div className="panel mb-3">
        <div className="panel-body py-2.5 px-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-gray-200/90 items-stretch">
            <div className="text-center min-w-0 px-1 py-0.5">
              <p className="text-[clamp(1.1rem,4.5vw,1.375rem)] font-black text-blue-600 tabular-nums leading-none">
                {totalAssetRemain.toFixed(1)}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1 leading-tight">사용 가능 휴가</p>
              <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5 leading-snug hidden sm:block">
                연차·돌봄 등
              </p>
            </div>
            <div className="text-center min-w-0 px-1 py-0.5">
              <p className="text-[clamp(1.1rem,4.5vw,1.375rem)] font-black text-amber-500 tabular-nums leading-none">
                {totalStamps}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1 leading-tight">누적 스탬프</p>
            </div>
            <HalfPoolKpiCell
              currentMonthKey={currentMonthKey}
              halfDayUsedByMonth={halfDayUsedByMonth}
              healingHalfReplaceUsedByMonth={healingHalfReplaceUsedByMonth}
            />
          </div>
          <p className="text-right text-[10px] text-gray-400 mt-2 hidden sm:block">
            참고 귀속 {fy}년도 · {formatYMD(new Date())} 유효 부여 합산
          </p>
        </div>
      </div>

      <LeaveApplyForm
        leaveTypes={serializeDates(leaveTypes) as any}
        allocations={serializeDates(allocations) as any}
        totalStamps={totalStamps}
        afternoonStampSlots={afternoonStampSlots}
        healingStampSlots={healingStampSlots}
        halfDayUsedByMonth={halfDayUsedByMonth}
        approvedHalfMonthKeys={approvedHalfMonthKeys}
        healingHalfReplaceUsedByMonth={healingHalfReplaceUsedByMonth}
        approvedHealingHalfReplaceMonthKeys={approvedHealingHalfReplaceMonthKeys}
        holidays={holidays.map((h) => holidayDateToYmd(h.date))}
      />

      <LeaveApplyFeatureTour />
    </div>
  );
}

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getFiscalYear } from "@/lib/workdays";
import { redirect } from "next/navigation";
import { formatYMD } from "@/lib/dateUtils";
import LeaveApplyForm from "./LeaveApplyForm";
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
      prisma.leaveAllocation.findMany({
        where: {
          employeeId: user.employeeId,
          isActive: true,
          validFrom:  { lte: dayEnd },
          validUntil: { gte: dayStart },
        },
        orderBy: [{ fiscalYear: "desc" }, { sourceCode: "asc" }],
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

  // 이번 달 하프데이 사용 횟수
  const halfDayType = leaveTypes.find((t) => t.code === "PM_HALF_MONTH");
  const halfDayUsed = halfDayType
    ? await prisma.leaveRequestItem.count({
        where: {
          leaveTypeId: halfDayType.id,
          leaveRequest: {
            employeeId: user.employeeId,
            status: { notIn: ["CANCELLED", "WITHDRAWN"] },
            startDate: {
              gte: new Date(now.getFullYear(), now.getMonth(), 1),
              lt:  new Date(now.getFullYear(), now.getMonth() + 1, 1),
            },
          },
        },
      })
    : 0;

  return (
    <div className="max-w-2xl">
      {/* 페이지 헤더 */}
      <div className="mb-3">
        <h1 className="page-title">휴가 신청</h1>
        <p className="page-subtitle">{fy}년도 귀속 · {employee?.name} · {employee?.team?.name}</p>
      </div>

      {/* 사용 가능 자산 요약 (공가·병가 미포함) */}
      <div className="panel mb-3">
        <div className="panel-body py-2.5 px-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="text-center min-w-[7rem]">
              <p className="text-[22px] font-black text-blue-600 tabular-nums leading-none">{totalAssetRemain.toFixed(1)}</p>
              <p className="text-xs text-gray-500 mt-1">사용 가능 휴가</p>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">연차·돌봄·이벤트 등</p>
            </div>
            <div className="w-px h-7 bg-gray-200" />
            <div className="text-center min-w-[5.5rem]">
              <p className="text-[22px] font-black text-amber-500 tabular-nums leading-none whitespace-nowrap">{totalStamps}</p>
              <p className="text-xs text-gray-500 mt-1 whitespace-nowrap">누적 스탬프 칸</p>
            </div>
            <div className="w-px h-7 bg-gray-200" />
            <div className="text-center min-w-[6.5rem]">
              <p className="text-[20px] font-black text-gray-600 leading-none whitespace-nowrap">
                {halfDayUsed > 0 ? "사용완료" : "미사용"}
              </p>
              <p className="text-xs text-gray-500 mt-1 whitespace-nowrap">이달 하프데이</p>
            </div>
            <div className="flex-1" />
            <div className="text-right text-xs text-gray-400 hidden sm:block">
              <p>귀속연도 {fy}년도</p>
              <p>{formatYMD(new Date())} 기준</p>
            </div>
          </div>
        </div>
      </div>

      <LeaveApplyForm
        leaveTypes={serializeDates(leaveTypes) as any}
        allocations={serializeDates(allocations) as any}
        totalStamps={totalStamps}
        afternoonStampSlots={afternoonStampSlots}
        healingStampSlots={healingStampSlots}
        halfDayUsed={halfDayUsed}
        holidays={holidays.map((h) => h.date.toISOString().slice(0, 10))}
      />
    </div>
  );
}

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getFiscalYear } from "@/lib/workdays";
import { formatYMD } from "@/lib/dateUtils";
import LeaveApplyForm from "./LeaveApplyForm";
import { serializeDates } from "@/lib/serialize";
import { countAfternoonEligible, countHealingEligible } from "@/lib/stampCard";
import { StampSlotGrid } from "@/components/stamp/StampSlotGrid";

export default async function LeaveApplyPage() {
  const session = await auth();
  const user = session!.user as any;
  const fy = getFiscalYear();
  const now = new Date();

  const [leaveTypes, allocations, employee, holidays, totalStamps, afternoonStampSlots, healingStampSlots] =
    await Promise.all([
      prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.leaveAllocation.findMany({
        where: {
          employeeId: user.employeeId,
          isActive: true,
          validFrom:  { lte: now },
          validUntil: { gte: now },
        },
        orderBy: [{ fiscalYear: "desc" }, { sourceCode: "asc" }],
      }),
      prisma.employee.findUnique({ where: { id: user.employeeId }, include: { team: true } }),
      prisma.holiday.findMany({ orderBy: { date: "asc" } }),
      prisma.stampCoupon.count({ where: { employeeId: user.employeeId } }),
      countAfternoonEligible(prisma, user.employeeId),
      countHealingEligible(prisma, user.employeeId),
    ]);

  /** 상단 KPI: 소모 가능 자산 잔여 (연차 풀 + 돌봄·연휴연장·포상·근속특별 등). 공가·병가 부여는 제외 */
  const KPI_ASSET_SOURCES = new Set([
    "BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER",
    "CARE", "HOLIDAY_EXT", "AWARD", "BIRTHDAY_HALF", "DUTY_DEPT",
    "TENURE_1Y", "TENURE_5Y", "TENURE_10Y",
  ]);
  const totalAssetRemain = allocations
    .filter((a) => KPI_ASSET_SOURCES.has(a.sourceCode))
    .filter((a) => new Date(a.validFrom) <= now && new Date(a.validUntil) >= now)
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

  const stampProgressOnCard = totalStamps % 10;

  return (
    <div className="max-w-2xl">
      {/* 페이지 헤더 */}
      <div className="mb-3">
        <h1 className="page-title">휴가 신청</h1>
        <p className="page-subtitle">{fy}년도 귀속 · {employee?.name} · {employee?.team?.name}</p>
      </div>

      {/* 사용 가능 자산 요약 (공가·병가 미포함) */}
      <div className="panel mb-3">
        <div className="panel-body py-3 px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-5 sm:flex-1 min-w-0">
              <div className="text-center min-w-0">
                <p className="text-lg sm:text-xl font-black text-blue-600 tabular-nums leading-none">
                  {totalAssetRemain.toFixed(1)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-400 mt-1">사용 가능 휴가</p>
                <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5 leading-tight">연차·돌봄 등</p>
              </div>
              <div className="hidden sm:block w-px h-10 bg-gray-200 shrink-0" aria-hidden />
              <div className="text-center min-w-0 flex flex-col items-center">
                <p className="text-lg sm:text-xl font-black text-amber-500 tabular-nums leading-none">{totalStamps}</p>
                <p className="text-[10px] sm:text-[11px] text-gray-400 mt-1">누적 스탬프</p>
                <StampSlotGrid
                  filledCount={stampProgressOnCard}
                  size="sm"
                  className="justify-center mt-1.5 max-w-[6.5rem] mx-auto"
                />
              </div>
              <div className="hidden sm:block w-px h-10 bg-gray-200 shrink-0" aria-hidden />
              <div className="text-center min-w-0">
                <p className="text-base sm:text-lg font-black text-gray-600 leading-none">
                  {halfDayUsed > 0 ? "사용" : "미사용"}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-400 mt-1">이달 하프데이</p>
              </div>
            </div>
            <div className="text-right text-[10px] sm:text-xs text-gray-400 shrink-0 pt-1 sm:pt-0 border-t border-gray-100 sm:border-0 sm:pl-2">
              <p>귀속 {fy}년</p>
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

import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getFiscalYear } from "@/lib/workdays";
import { redirect } from "next/navigation";
import { formatYMD, holidayDateToYmd } from "@/lib/dateUtils";
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

  // 이번 달 하프데이 + 힐링데이(하프대체) 합산(월 1회 공유)
  const halfDayType = leaveTypes.find((t) => t.code === "PM_HALF_MONTH");
  const halfReplaceType = leaveTypes.find((t) => t.code === "HEALING_DAY_HALF_REPLACE");
  const halfPoolIds = [halfDayType?.id, halfReplaceType?.id].filter(Boolean) as string[];
  const halfDayUsed =
    halfPoolIds.length > 0
      ? await prisma.leaveRequestItem.count({
          where: {
            leaveTypeId: { in: halfPoolIds },
            leaveRequest: {
              employeeId: user.employeeId,
              status: { notIn: ["CANCELLED", "WITHDRAWN", "REJECTED"] },
              startDate: {
                gte: new Date(now.getFullYear(), now.getMonth(), 1),
                lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
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
        <p className="page-subtitle">
          {employee?.name} · {employee?.team?.name}
          <span className="text-gray-400 font-normal"> · 신청 일정과 유효기간이 맞는 부여만 집계·차감</span>
        </p>
      </div>

      {/* 사용 가능 자산 요약 (공가·병가 미포함) */}
      <div className="panel mb-3">
        <div className="panel-body py-2.5 px-3">
          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-6 sm:justify-between">
            <div className="text-center min-w-0 px-0.5">
              <p className="text-[clamp(1.1rem,4.5vw,1.375rem)] font-black text-blue-600 tabular-nums leading-none">
                {totalAssetRemain.toFixed(1)}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1 leading-tight">사용 가능 휴가</p>
              <p className="text-[9px] sm:text-[10px] text-gray-400 mt-0.5 leading-snug hidden sm:block">
                연차·돌봄 등
              </p>
            </div>
            <div className="text-center min-w-0 px-0.5 border-x border-gray-200/90 sm:border-x-0 sm:border-l sm:border-gray-200 sm:pl-6">
              <p className="text-[clamp(1.1rem,4.5vw,1.375rem)] font-black text-amber-500 tabular-nums leading-none">
                {totalStamps}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1 leading-tight">누적 스탬프</p>
            </div>
            <div className="text-center min-w-0 px-0.5">
              <p className="text-[clamp(1rem,4vw,1.25rem)] font-black text-gray-600 leading-none tabular-nums">
                {halfDayUsed > 0 ? "완료" : "미사용"}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-500 mt-1 leading-tight">이달 하프데이·하프대체</p>
            </div>
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
        halfDayUsed={halfDayUsed}
        holidays={holidays.map((h) => holidayDateToYmd(h.date))}
      />
    </div>
  );
}

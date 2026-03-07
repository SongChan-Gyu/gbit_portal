import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getFiscalYear } from "@/lib/workdays";
import { formatYMD } from "@/lib/dateUtils";
import LeaveApplyForm from "./LeaveApplyForm";
import { serializeDates } from "@/lib/serialize";

export default async function LeaveApplyPage() {
  const session = await auth();
  const user = session!.user as any;
  const fy = getFiscalYear();
  const now = new Date();

  const [leaveTypes, allocations, employee, stamps, holidays] = await Promise.all([
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
    prisma.stampCoupon.findMany({
      where: { employeeId: user.employeeId, isUsed: false },
      orderBy: { stampDate: "asc" },
    }),
    prisma.holiday.findMany({ orderBy: { date: "asc" } }),
  ]);

  // 잔여 연차 = 연차(기본+근속가산+이월)만. 특별휴가·경조·돌봄 등 제외
  const ANNUAL_ONLY_SOURCES = new Set(["BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER"]);
  const totalRemain = allocations
    .filter((a) => ANNUAL_ONLY_SOURCES.has(a.sourceCode))
    .reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0);

  // 이번 달 하프데이 사용 횟수
  const halfDayType = leaveTypes.find((t) => t.code === "PM_HALF_MONTH");
  const halfDayUsed = halfDayType
    ? await prisma.leaveRequestItem.count({
        where: {
          leaveTypeId: halfDayType.id,
          leaveRequest: {
            employeeId: user.employeeId,
            status: { not: "CANCELLED" },
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
      <div className="mb-5">
        <h1 className="page-title">휴가 신청</h1>
        <p className="page-subtitle">{fy}년도 귀속 · {employee?.name} · {employee?.team?.name}</p>
      </div>

      {/* 잔여 연차 요약 바 */}
      <div className="panel mb-5">
        <div className="panel-body">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xl font-black text-blue-600">{totalRemain.toFixed(1)}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">잔여 연차</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <p className="text-xl font-black text-amber-500">{stamps.length}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">보유 스탬프</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <p className="text-xl font-black text-gray-500">{halfDayUsed > 0 ? "사용완료" : "미사용"}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">이달 하프데이</p>
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
        stamps={serializeDates(stamps) as any}
        halfDayUsed={halfDayUsed}
        holidays={holidays.map((h) => h.date.toISOString().slice(0, 10))}
        employeeId={user.employeeId}
      />
    </div>
  );
}

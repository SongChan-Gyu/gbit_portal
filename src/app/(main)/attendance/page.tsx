import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import AttendanceClient from "./AttendanceClient";
import { redirect } from "next/navigation";

export default async function AttendancePage({
  searchParams,
}: { searchParams: Promise<{ year?: string; month?: string; view?: string }> }) {
  const session = await auth();
  const user = session!.user as any;
  const isAdmin = ["PM","ADMIN","TEAM_LEAD"].includes(user.role);

  const self = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  });
  if (self?.employeeType === "EXTERNAL") redirect("/dashboard");

  const { year: yearRaw, month: monthRaw, view: viewRaw } = await searchParams;
  const now   = new Date();
  const year  = parseInt(yearRaw  ?? String(now.getFullYear()));
  const month = parseInt(monthRaw ?? String(now.getMonth() + 1));
  const view  = viewRaw ?? "monthly"; // monthly | annual

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd   = new Date(year, month,     0, 23, 59, 59);

  // 귀속연도 계산 (5월 기준)
  const fy = month >= 5 ? year : year - 1;
  const fyStart = new Date(`${fy}-05-01`);
  const fyEnd   = new Date(`${fy+1}-04-30`);

  // 직원 목록
  const empWhere = isAdmin ? { status:"ACTIVE" } : { id:user.employeeId };
  const employees = await prisma.employee.findMany({
    where: empWhere as any,
    include: { team: true },
    orderBy: [{ team:{ sortOrder:"asc" }}, { name:"asc" }],
  });

  // 승인된 휴가 (월간)
  const monthRequests = await prisma.leaveRequest.findMany({
    where: {
      employeeId: { in: employees.map((e)=>e.id) },
      status: "APPROVED",
      startDate: { lte: monthEnd },
      endDate:   { gte: monthStart },
    },
    include: { items: { include: { leaveType: true } } },
  });

  // 승인된 휴가 (귀속연도 전체)
  const annualRequests = await prisma.leaveRequest.findMany({
    where: {
      employeeId: { in: employees.map((e)=>e.id) },
      status: "APPROVED",
      startDate: { lte: fyEnd   },
      endDate:   { gte: fyStart },
    },
    include: { items: { include: { leaveType: true } } },
  });

  // 할당 (잔여일수용)
  const allocations = await prisma.leaveAllocation.findMany({
    where: {
      employeeId: { in: employees.map((e)=>e.id) },
      fiscalYear: fy,
      isActive: true,
    },
  });

  // 공휴일
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: monthStart, lte: monthEnd } },
  });

  // 휴가유형 목록 (범례)
  const leaveTypes = await prisma.leaveType.findMany({ orderBy:{ sortOrder:"asc" } });

  return (
    <AttendanceClient
      employees={employees.map((e) => ({
        id: e.id, name: e.name, position: e.position, teamName: e.team?.name ?? "-",
        hireDate: e.hireDate?.toISOString() ?? null,
      }))}
      monthRequests={monthRequests.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        startDate: r.startDate.toISOString(),
        endDate:   r.endDate.toISOString(),
        totalDays: r.totalDays,
        items: r.items.map((i) => ({
          leaveTypeId: i.leaveTypeId,
          leaveTypeName: i.leaveType.name,
          leaveTypeCode: i.leaveType.code,
          leaveTypeColor: i.leaveType.color,
          leaveTypeApplyGroupKey: i.leaveType.applyGroupKey ?? null,
          days: i.days,
          startDate: i.startDate.toISOString(),
          endDate:   i.endDate.toISOString(),
          isHalf: i.leaveType.isHalf,
          isAmOnly: i.leaveType.isAmOnly,
          isPmOnly: i.leaveType.isPmOnly,
          allowsFullDay: (i.leaveType as any).allowsFullDay ?? null,
          allowsHalfDay: (i.leaveType as any).allowsHalfDay ?? null,
          halfDayAmPm: (i.leaveType as any).halfDayAmPm ?? null,
          timeSlot: i.timeSlot ?? null,
        })),
      }))}
      annualRequests={annualRequests.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        startDate: r.startDate.toISOString(),
        endDate:   r.endDate.toISOString(),
        items: r.items.map((i) => ({
          leaveTypeCode: i.leaveType.code,
          leaveTypeName: i.leaveType.name,
          leaveTypeColor: i.leaveType.color,
          leaveTypeApplyGroupKey: i.leaveType.applyGroupKey ?? null,
          days: i.days,
          startDate: i.startDate.toISOString(),
          endDate:   i.endDate.toISOString(),
          isHalf: i.leaveType.isHalf,
          isAmOnly: i.leaveType.isAmOnly,
          isPmOnly: i.leaveType.isPmOnly,
          allowsFullDay: (i.leaveType as any).allowsFullDay ?? null,
          allowsHalfDay: (i.leaveType as any).allowsHalfDay ?? null,
          halfDayAmPm: (i.leaveType as any).halfDayAmPm ?? null,
          timeSlot: i.timeSlot ?? null,
        })),
      }))}
      allocations={allocations.map((a) => ({
        id: a.id, employeeId: a.employeeId,
        sourceCode: a.sourceCode, label: a.label,
        totalDays: a.totalDays, usedDays: a.usedDays,
      }))}
      holidays={holidays.map((h) => h.date.toISOString().slice(0,10))}
      leaveTypes={leaveTypes.map((lt) => ({ id:lt.id, code:lt.code, name:lt.name, color:lt.color, isHalf:lt.isHalf }))}
      year={year} month={month} fy={fy}
      isAdmin={isAdmin}
      initView={view}
    />
  );
}

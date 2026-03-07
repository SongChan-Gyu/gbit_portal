import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import TeamScheduleClient from "./TeamScheduleClient";

/** 이번 주 월~일 날짜 배열 반환 */
function getWeekDates(base?: Date) {
  const today = base ?? new Date();
  // 월요일 기준
  const day = today.getDay(); // 0=일,1=월...6=토
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** 이번 주 기준 w주 이동한 월요일 날짜 */
function getBaseDate(weekOffset: number) {
  const today = new Date();
  today.setDate(today.getDate() + weekOffset * 7);
  return today;
}

export default async function TeamSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;
  const weekOffset = parseInt(w ?? "0", 10) || 0;

  const session = await auth();
  const user = session!.user as any;

  // 자신의 팀 조회
  const me = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: { team: { include: { employees: { where: { status: "ACTIVE" }, orderBy: { name: "asc" } } } } },
  });

  if (!me?.team) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="page-title mb-6">팀 주간 일정</h1>
        <div className="card text-center py-12 text-gray-400">소속 팀이 없습니다.</div>
      </div>
    );
  }

  const weekDates = getWeekDates(getBaseDate(weekOffset));
  const startDate = new Date(weekDates[0]);
  const endDate   = new Date(weekDates[6]);
  endDate.setHours(23, 59, 59, 999);

  const memberIds = me.team.employees.map((m: { id: string }) => m.id);

  // 이번 주 승인된 휴가 신청 조회 (휴가 유형은 가져오지 않음 - 개인정보)
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      employeeId: { in: memberIds },
      status: "APPROVED",
      startDate: { lte: endDate },
      endDate:   { gte: startDate },
    },
    include: {
      items: {
        include: {
          leaveType: { select: { isHalf: true, isAmOnly: true, isPmOnly: true } },
        },
      },
    },
  });

  // 직원별 날짜별 휴가 상태 계산
  // 상태: "AM" | "PM" | "FULL" | null
  type DayStatus = "AM" | "PM" | "FULL" | null;
  const schedule: Record<string, Record<string, DayStatus>> = {};
  // empId → dateStr → status

  for (const req of leaveRequests) {
    const empId = req.employeeId;
    if (!schedule[empId]) schedule[empId] = {};

    for (const item of req.items) {
      const s = new Date(item.startDate);
      const e = new Date(item.endDate);
      const cur = new Date(s);
      while (cur <= e) {
        const dateStr = cur.toISOString().slice(0, 10);
        if (weekDates.includes(dateStr)) {
          const lt = item.leaveType;
          let status: DayStatus;
          if (lt.isHalf && lt.isAmOnly) status = "AM";
          else if (lt.isHalf && !lt.isAmOnly) status = "PM";
          else status = "FULL";

          const prev = schedule[empId][dateStr];
          // 오전+오후 = 종일
          if (prev === "AM" && status === "PM") schedule[empId][dateStr] = "FULL";
          else if (prev === "PM" && status === "AM") schedule[empId][dateStr] = "FULL";
          else if (!prev) schedule[empId][dateStr] = status;
          else schedule[empId][dateStr] = "FULL"; // 중복이면 종일 처리
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }

  const members = me.team.employees.map((m: { id: string; name: string; position: string }) => ({
    id: m.id,
    name: m.name,
    position: m.position,
    isMe: m.id === user.employeeId,
  }));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">팀 주간 일정</h1>
          <p className="text-sm text-gray-500 mt-1">{me.team.name} · 휴가 여부만 표시됩니다</p>
        </div>
      </div>
      <TeamScheduleClient
        members={members}
        weekDates={weekDates}
        schedule={schedule}
        todayStr={new Date().toISOString().slice(0, 10)}
        weekOffset={weekOffset}
      />
    </div>
  );
}

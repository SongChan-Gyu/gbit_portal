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

/** 해당 연월의 모든 날짜 (YYYY-MM-DD) */
function getMonthDates(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  const list: string[] = [];
  const m = String(month).padStart(2, "0");
  for (let d = 1; d <= last; d++) {
    list.push(`${year}-${m}-${String(d).padStart(2, "0")}`);
  }
  return list;
}

type DayStatus = "AM" | "PM" | "FULL" | null;

function buildSchedule(
  leaveRequests: any[],
  dateList: string[],
): { schedule: Record<string, Record<string, DayStatus>>; byDay: Record<string, { name: string; status: DayStatus }[]> } {
  const schedule: Record<string, Record<string, DayStatus>> = {};
  const byDay: Record<string, { name: string; status: DayStatus }[]> = {};
  const dateSet = new Set(dateList);

  for (const req of leaveRequests) {
    const empId = req.employeeId;
    const empName = (req as any).employee?.name ?? "";
    if (!schedule[empId]) schedule[empId] = {};

    for (const item of req.items) {
      const s = new Date(item.startDate);
      const e = new Date(item.endDate);
      const cur = new Date(s);
      while (cur <= e) {
        const dateStr = cur.toISOString().slice(0, 10);
        if (dateSet.has(dateStr)) {
          const lt = item.leaveType;
          let status: DayStatus;
          if (lt.isHalf && lt.isAmOnly) status = "AM";
          else if (lt.isHalf && !lt.isAmOnly) status = "PM";
          else status = "FULL";

          const prev = schedule[empId][dateStr];
          if (prev === "AM" && status === "PM") schedule[empId][dateStr] = "FULL";
          else if (prev === "PM" && status === "AM") schedule[empId][dateStr] = "FULL";
          else if (!prev) schedule[empId][dateStr] = status;
          else schedule[empId][dateStr] = "FULL";

          if (!byDay[dateStr]) byDay[dateStr] = [];
          const existing = byDay[dateStr].find((x) => x.name === empName);
          if (!existing) byDay[dateStr].push({ name: empName, status: schedule[empId][dateStr]! });
          else existing.status = schedule[empId][dateStr]!;
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return { schedule, byDay };
}

export default async function TeamSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; view?: string; y?: string; m?: string }>;
}) {
  const { w, view: viewRaw, y: yRaw, m: mRaw } = await searchParams;
  const weekOffset = parseInt(w ?? "0", 10) || 0;
  const view = viewRaw === "month" ? "month" : "week";
  const now = new Date();
  const year = parseInt(yRaw ?? String(now.getFullYear()), 10) || now.getFullYear();
  const month = parseInt(mRaw ?? String(now.getMonth() + 1), 10) || now.getMonth() + 1;
  const safeMonth = Math.min(12, Math.max(1, month));

  const session = await auth();
  const user = session!.user as any;

  const me = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: { team: { include: { employees: { where: { status: "ACTIVE" }, orderBy: { name: "asc" } } } } },
  });

  const isAdminOrPm = user.role === "ADMIN" || user.role === "PM";
  const membersSource = me?.team?.employees ?? (isAdminOrPm ? await prisma.employee.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" }, include: { team: true } }) : []);

  if (membersSource.length === 0 && !me?.team) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="page-title mb-6">팀 일정</h1>
        <div className="card text-center py-12 text-gray-400">소속 팀이 없습니다.</div>
      </div>
    );
  }

  const memberIds = membersSource.map((m: { id: string }) => m.id);
  const weekDates = getWeekDates(getBaseDate(weekOffset));
  const monthDates = getMonthDates(year, safeMonth);
  const startDate = view === "week"
    ? new Date(weekDates[0])
    : new Date(year, safeMonth - 1, 1);
  const endDate = view === "week"
    ? (() => { const e = new Date(weekDates[6]); e.setHours(23, 59, 59, 999); return e; })()
    : new Date(year, safeMonth, 0, 23, 59, 59, 999);

  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      employeeId: { in: memberIds },
      status: "APPROVED",
      startDate: { lte: endDate },
      endDate:   { gte: startDate },
    },
    include: {
      employee: { select: { name: true } },
      items: {
        include: {
          leaveType: { select: { isHalf: true, isAmOnly: true, isPmOnly: true } },
        },
      },
    },
  });

  const dateList = view === "week" ? weekDates : monthDates;
  const { schedule, byDay } = buildSchedule(leaveRequests, dateList);

  const members = membersSource.map((m: { id: string; name: string; position?: string; team?: { name: string } | null }) => ({
    id: m.id,
    name: m.name,
    position: m.position ?? (m.team?.name ?? ""),
    isMe: m.id === user.employeeId,
  }));

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">{me?.team ? "팀 일정" : "전체 일정"}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {me?.team ? `${me.team.name} · ` : ""}휴가 여부(오전/오후) 표시
          </p>
        </div>
      </div>
      <TeamScheduleClient
        view={view}
        members={members}
        weekDates={weekDates}
        monthYear={{ year, month: safeMonth }}
        monthDates={monthDates}
        schedule={schedule}
        byDay={byDay}
        todayStr={new Date().toISOString().slice(0, 10)}
        weekOffset={weekOffset}
        isAdminOrPm={isAdminOrPm}
      />
    </div>
  );
}

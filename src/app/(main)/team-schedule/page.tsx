import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { eachYmdInInclusiveRange, holidayDateToYmd, kstWeekYmdsForWeekOffset, kstYmd, todayKstYmd, ymdRangeUtcBounds } from "@/lib/dateUtils";
import { kstEndOfDay, kstMidnightFromYmd } from "@/lib/workdays";
import { itemSlotForSchedule } from "@/lib/leaveTimeSlot";
import TeamScheduleClient from "./TeamScheduleClient";

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
      const startYmd = kstYmd(new Date(item.startDate));
      const endYmd = kstYmd(new Date(item.endDate));
      for (const dateStr of eachYmdInInclusiveRange(startYmd, endYmd)) {
        if (dateSet.has(dateStr)) {
          const lt = item.leaveType;
          const status: DayStatus = itemSlotForSchedule(item, lt);

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
  const todayY = todayKstYmd();
  const [defY, defM] = todayY.split("-").map((x) => parseInt(x, 10));
  const year = parseInt(yRaw ?? String(defY), 10) || defY;
  const month = parseInt(mRaw ?? String(defM), 10) || defM;
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
  const weekDates = kstWeekYmdsForWeekOffset(weekOffset);
  const monthDates = getMonthDates(year, safeMonth);
  const startDate =
    view === "week"
      ? kstMidnightFromYmd(weekDates[0]!)
      : kstMidnightFromYmd(`${year}-${String(safeMonth).padStart(2, "0")}-01`);
  const endDate =
    view === "week"
      ? (() => {
          const last = weekDates[6]!;
          const [y, m, d] = last.split("-").map((x) => parseInt(x, 10));
          return kstEndOfDay(y, m, d);
        })()
      : (() => {
          const lastD = new Date(year, safeMonth, 0).getDate();
          return kstEndOfDay(year, safeMonth, lastD);
        })();

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

  const rangeStart = view === "week" ? weekDates[0]! : monthDates[0]!;
  const rangeEnd = view === "week" ? weekDates[6]! : monthDates[monthDates.length - 1]!;
  const { gte: holGte, lte: holLte } = ymdRangeUtcBounds(rangeStart, rangeEnd);
  const holRows = await prisma.holiday.findMany({
    where: { date: { gte: holGte, lte: holLte } },
    select: { date: true },
  });
  const holidayYmds = holRows.map((h) => holidayDateToYmd(h.date));

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
        holidayYmds={holidayYmds}
        todayStr={todayKstYmd()}
        weekOffset={weekOffset}
        isAdminOrPm={isAdminOrPm}
      />
    </div>
  );
}

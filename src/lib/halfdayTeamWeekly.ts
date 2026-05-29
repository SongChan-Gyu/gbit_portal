import type { DB } from "@/lib/db";
import { addDaysYMD, holidayDateToYmd, ymdRangeUtcBounds } from "@/lib/dateUtils";
import {
  PM_HALF_MONTH_CODE,
  TEAM_HALF_WEEKLY_LIMIT_ERROR,
  isTeamHalfWeeklyLimitTeam,
  weekStartYmdFromYmd,
  wouldExceedTeamHalfWeeklyLimit,
} from "@/lib/halfdayPolicy";

const ACTIVE_LEAVE_STATUSES = ["CANCELLED", "WITHDRAWN", "REJECTED"] as const;

/** 팀·주(월~일) 기준 하프데이 신청(대기·승인) 직원 ID 목록 */
export async function listTeamHalfDayApplicantIdsInWeek(
  db: DB,
  teamId: string,
  leaveYmd: string,
): Promise<string[]> {
  const weekStart = weekStartYmdFromYmd(leaveYmd);
  const weekEnd = addDaysYMD(weekStart, 6);
  const { gte, lte } = ymdRangeUtcBounds(weekStart, weekEnd);

  const items = await db.leaveRequestItem.findMany({
    where: {
      leaveType: { code: PM_HALF_MONTH_CODE },
      startDate: { gte, lte },
      leaveRequest: {
        employee: { teamId },
        status: { notIn: [...ACTIVE_LEAVE_STATUSES] },
      },
    },
    select: { leaveRequest: { select: { employeeId: true } } },
  });

  return [...new Set(items.map((i) => i.leaveRequest.employeeId))];
}

/** 2팀 등 제한 대상 팀이면 주간 4명 초과 시 에러 문구, 아니면 null */
export async function teamHalfDayWeeklyLimitError(
  db: DB,
  opts: {
    teamId: string | null | undefined;
    teamName: string | null | undefined;
    employeeId: string;
    leaveYmd: string;
  },
): Promise<string | null> {
  const { teamId, teamName, employeeId, leaveYmd } = opts;
  if (!teamId || !isTeamHalfWeeklyLimitTeam(teamName)) return null;

  const applicantIds = await listTeamHalfDayApplicantIdsInWeek(db, teamId, leaveYmd);
  if (wouldExceedTeamHalfWeeklyLimit(applicantIds, employeeId)) {
    return TEAM_HALF_WEEKLY_LIMIT_ERROR;
  }
  return null;
}

/** 신청 화면용 — 기간 내 팀 하프데이 신청 직원 (주별 집계) */
export async function fetchTeamHalfWeekApplicantMap(
  db: DB,
  teamId: string,
  rangeStartYmd: string,
  rangeEndYmd: string,
): Promise<Record<string, string[]>> {
  const { gte, lte } = ymdRangeUtcBounds(rangeStartYmd, rangeEndYmd);
  const items = await db.leaveRequestItem.findMany({
    where: {
      leaveType: { code: PM_HALF_MONTH_CODE },
      startDate: { gte, lte },
      leaveRequest: {
        employee: { teamId },
        status: { notIn: [...ACTIVE_LEAVE_STATUSES] },
      },
    },
    select: {
      startDate: true,
      leaveRequest: { select: { employeeId: true } },
    },
  });

  const map = new Map<string, Set<string>>();
  for (const item of items) {
    const ymd = holidayDateToYmd(item.startDate);
    const key = weekStartYmdFromYmd(ymd);
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(item.leaveRequest.employeeId);
  }
  return Object.fromEntries([...map.entries()].map(([k, v]) => [k, [...v]]));
}

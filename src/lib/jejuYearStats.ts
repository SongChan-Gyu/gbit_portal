import type { DB } from "@/lib/db";

/** KST 달력연도 구간 (1/1 00:00 ~ 12/31 23:59:59.999 +09:00) */
export function kstCalendarYearBounds(year: number): { start: Date; end: Date } {
  const start = new Date(`${year}-01-01T00:00:00+09:00`);
  const end = new Date(`${year}-12-31T23:59:59.999+09:00`);
  return { start, end };
}

const EXCLUDED_FROM_SUBMITTED_YEAR_COUNT = ["REJECTED", "CANCELLED"] as const;

/** 내부 직원 이사만 연간 제주 숙소 이용 횟수 제한 없음 (외부개발자 이사는 연 2회) */
export const JEJU_DIRECTOR_POSITION = "이사";

/** 이사를 제외한 직원(및 외부개발자 이사)의 달력연도 제주 숙소 이용(신청) 한도 */
export const JEJU_YEARLY_USAGE_LIMIT = 2;

export type JejuYearlyUsageEmployee = {
  position?: string | null;
  employeeType?: string | null;
};

/** 내부 직원(FULL/FREE 등) 이사만 제한 없음. EXTERNAL 이사는 연 2회 적용 */
export function isJejuUnlimitedEmployee(emp: JejuYearlyUsageEmployee | null | undefined): boolean {
  if ((emp?.employeeType ?? "").trim() === "EXTERNAL") return false;
  return (emp?.position ?? "").trim() === JEJU_DIRECTOR_POSITION;
}

/** @deprecated position만으로 판단 — employeeType 포함 시 isJejuUnlimitedEmployee 사용 */
export function isJejuUnlimitedPosition(position: string | null | undefined): boolean {
  return isJejuUnlimitedEmployee({ position });
}

/** null이면 제한 없음(내부 직원 이사) */
export function getJejuYearlyUsageLimit(emp: JejuYearlyUsageEmployee | null | undefined): number | null {
  return isJejuUnlimitedEmployee(emp) ? null : JEJU_YEARLY_USAGE_LIMIT;
}

/** 달력연도 기준 신청 가능 여부 (반려·완전 취소 제외 집계) */
export function canSubmitJejuInCalendarYear(
  stats: Pick<JejuCalendarYearStats, "submittedCount">,
  emp: JejuYearlyUsageEmployee | null | undefined,
): boolean {
  const limit = getJejuYearlyUsageLimit(emp);
  if (limit == null) return true;
  return stats.submittedCount < limit;
}

export function formatJejuYearlyUsageLimitError(year: number): string {
  return `${year}년 제주도 숙소 이용은 연 ${JEJU_YEARLY_USAGE_LIMIT}회까지 가능합니다. (내부 직원 이사는 제한 없음)`;
}

export function formatJejuYearlyUsageLimitHint(
  year: number,
  stats: Pick<JejuCalendarYearStats, "submittedCount">,
  emp: JejuYearlyUsageEmployee | null | undefined,
): string | null {
  const limit = getJejuYearlyUsageLimit(emp);
  if (limit == null) return null;
  const remaining = Math.max(0, limit - stats.submittedCount);
  if (remaining <= 0) {
    return `※ ${year}년 제주도 숙소 이용 한도(${limit}회)에 도달했습니다.`;
  }
  if (stats.submittedCount >= limit - 1) {
    return `※ ${year}년 제주도 숙소 이용은 연 ${limit}회까지 가능합니다. (남은 신청 ${remaining}회)`;
  }
  return null;
}

export type JejuYearlyUsageInfo = {
  limit: number | null;
  submittedCount: number;
  remaining: number | null;
  canSubmit: boolean;
  isUnlimited: boolean;
  hint: string | null;
};

export function buildJejuYearlyUsageInfo(
  stats: JejuCalendarYearStats,
  emp: JejuYearlyUsageEmployee | null | undefined,
): JejuYearlyUsageInfo {
  const limit = getJejuYearlyUsageLimit(emp);
  const canSubmit = canSubmitJejuInCalendarYear(stats, emp);
  return {
    limit,
    submittedCount: stats.submittedCount,
    remaining: limit == null ? null : Math.max(0, limit - stats.submittedCount),
    canSubmit,
    isUnlimited: limit == null,
    hint: formatJejuYearlyUsageLimitHint(stats.year, stats, emp),
  };
}

export type JejuCalendarYearStats = {
  /** 달력연도 (예: 2026) */
  year: number;
  /**
   * 해당 연도에 접수된 건수(신청 시각 createdAt 기준).
   * 반려·완전 취소는 제외. 취소 요청 중 등은 포함.
   */
  submittedCount: number;
  /**
   * 해당 달력연도에 숙박일이 걸치고 최종 승인(APPROVED)된 건수(이용 확정).
   */
  approvedStayInYearCount: number;
};

/** 신청자 1명에 대한 달력연도 기준 제주 숙소 집계 */
export async function getJejuCalendarYearStats(
  db: DB,
  employeeId: string,
  year: number,
): Promise<JejuCalendarYearStats> {
  const { start, end } = kstCalendarYearBounds(year);
  const [submittedCount, approvedStayInYearCount] = await Promise.all([
    db.jejuAccommodation.count({
      where: {
        employeeId,
        createdAt: { gte: start, lte: end },
        status: { notIn: [...EXCLUDED_FROM_SUBMITTED_YEAR_COUNT] },
      },
    }),
    db.jejuAccommodation.count({
      where: {
        employeeId,
        status: "APPROVED",
        startDate: { lte: end },
        endDate: { gte: start },
      },
    }),
  ]);
  return { year, submittedCount, approvedStayInYearCount };
}

export type JejuYearStatsMap = Map<string, JejuCalendarYearStats>;

/** 목록에 나온 신청자 ID들에 대해 같은 달력연도 집계를 한 번에 조회 */
export async function getJejuCalendarYearStatsForEmployees(
  db: DB,
  employeeIds: string[],
  year: number,
): Promise<JejuYearStatsMap> {
  const out = new Map<string, JejuCalendarYearStats>();
  const ids = [...new Set(employeeIds)].filter(Boolean);
  if (ids.length === 0) return out;
  const { start, end } = kstCalendarYearBounds(year);
  for (const id of ids) {
    out.set(id, { year, submittedCount: 0, approvedStayInYearCount: 0 });
  }

  const submittedGroups = await db.jejuAccommodation.groupBy({
    by: ["employeeId"],
    where: {
      employeeId: { in: ids },
      createdAt: { gte: start, lte: end },
      status: { notIn: [...EXCLUDED_FROM_SUBMITTED_YEAR_COUNT] },
    },
    _count: { _all: true },
  });
  for (const g of submittedGroups) {
    const cur = out.get(g.employeeId);
    if (cur) cur.submittedCount = g._count._all;
  }

  const approvedRows = await db.jejuAccommodation.findMany({
    where: {
      employeeId: { in: ids },
      status: "APPROVED",
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { employeeId: true },
  });
  const approvedByEmp = new Map<string, number>();
  for (const r of approvedRows) {
    approvedByEmp.set(r.employeeId, (approvedByEmp.get(r.employeeId) ?? 0) + 1);
  }
  for (const id of ids) {
    const cur = out.get(id);
    if (cur) cur.approvedStayInYearCount = approvedByEmp.get(id) ?? 0;
  }

  return out;
}

/** 올해 신청 건수가 이 값 이상이면 결재·신청 화면에 안내 배지 (연간 이용 한도와 동일) */
export const JEJU_YEARLY_SUBMIT_WARN_THRESHOLD = JEJU_YEARLY_USAGE_LIMIT;

/** 신청·결재 화면 공통 안내 (임의 조정 가능) */
export const JEJU_YEARLY_HIGH_SUBMISSION_HINT =
  `※ 해당 연도(달력) 기준 제주 숙소 신청이 ${JEJU_YEARLY_USAGE_LIMIT}회에 도달했습니다. (내부 직원 이사는 제한 없음)`;

/** 연간 이용 한도가 적용되는 직원에게 항상 표시하는 정책 안내 */
export const JEJU_YEARLY_USAGE_POLICY_NOTE =
  `제주도 이용 횟수는 연 ${JEJU_YEARLY_USAGE_LIMIT}회로 제한됩니다.`;

/** 내부 직원 이사(연간 한도 없음)에게만 표시하는 보조 안내 */
export const JEJU_YEARLY_USAGE_UNLIMITED_DIRECTOR_NOTE =
  "내부 직원 이사는 연간 제한 없이 신청할 수 있습니다.";

/** 신청자·승인자·예약 화면에 쓰는 한 줄 요약 (KST 달력연도 집계와 동일 숫자) */
export function formatJejuYearStatsSummary(year: number, submittedCount: number, approvedStayCount: number): string {
  return `${year}년 기준 제주숙소 신청현황 — 신청 ${submittedCount}건 · 예약확정 ${approvedStayCount}건`;
}

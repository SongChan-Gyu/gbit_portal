import type { DB } from "@/lib/db";

/** KST 달력연도 구간 (1/1 00:00 ~ 12/31 23:59:59.999 +09:00) */
export function kstCalendarYearBounds(year: number): { start: Date; end: Date } {
  const start = new Date(`${year}-01-01T00:00:00+09:00`);
  const end = new Date(`${year}-12-31T23:59:59.999+09:00`);
  return { start, end };
}

const EXCLUDED_FROM_SUBMITTED_YEAR_COUNT = ["REJECTED", "CANCELLED"] as const;

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

/** 올해 신청 건수가 이 값 이상이면 결재·신청 화면에 안내 배지 */
export const JEJU_YEARLY_SUBMIT_WARN_THRESHOLD = 3;

/** 신청·결재 화면 공통 안내 (임의 조정 가능) */
export const JEJU_YEARLY_HIGH_SUBMISSION_HINT =
  "※ 해당 연도(달력) 기준 제주 숙소 신청이 3회 이상입니다.";

/** 신청자·승인자·예약 화면에 쓰는 한 줄 요약 (KST 달력연도 집계와 동일 숫자) */
export function formatJejuYearStatsSummary(year: number, submittedCount: number, approvedStayCount: number): string {
  return `${year}년 기준 제주숙소 신청현황 — 신청 ${submittedCount}건 · 예약확정 ${approvedStayCount}건`;
}

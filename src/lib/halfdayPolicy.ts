import { addDaysYMD, calendarUtcDowFromYMD, todayKstYmd } from "@/lib/dateUtils";

export const PM_HALF_MONTH_CODE = "PM_HALF_MONTH" as const;

/** 해당 연·월의 첫째 주 수요일 (달력 YMD, KST 달력 축) */
export function firstWednesdayYmdOfMonth(year: number, month: number): string {
  let ymd = `${year}-${String(month).padStart(2, "0")}-01`;
  while (calendarUtcDowFromYMD(ymd) !== 3) {
    ymd = addDaysYMD(ymd, 1);
  }
  return ymd;
}

/** 해당월 하프데이 신청 마감(첫째 주 수요일) 경과 여부 — todayKst > deadline 이면 true */
export function isPastHalfdayApplicationDeadlineForMonth(
  targetYmd: string,
  todayKst?: string,
): boolean {
  const ymd = targetYmd.slice(0, 10);
  const [y, m] = ymd.split("-").map(Number);
  if (!y || !m) return false;
  const deadline = firstWednesdayYmdOfMonth(y, m);
  const today = (todayKst ?? todayKstYmd()).slice(0, 10);
  return today > deadline;
}

export function halfdayApplicationDeadlineLabel(year: number, month: number): string {
  return firstWednesdayYmdOfMonth(year, month);
}

export function halfdayApplicationDeadlineError(targetYmd: string): string {
  const ymd = targetYmd.slice(0, 10);
  const [y, m] = ymd.split("-").map(Number);
  const deadline = firstWednesdayYmdOfMonth(y, m);
  return `하프데이는 해당 월(${y}년 ${m}월) 첫째 주 수요일(${deadline})까지만 신청할 수 있습니다.`;
}

export function requestHasPmHalfMonth(
  items: { leaveType: { code: string } }[],
): boolean {
  return items.some((i) => i.leaveType.code === PM_HALF_MONTH_CODE);
}

/** 해당 월에 승인된 힐링데이(하프대체)가 있으면 하프데이 신청 불가 */
export function halfDayBlockedByApprovedHealing(
  monthKey: string,
  approvedHealingHalfReplaceMonthKeys: Iterable<string>,
): boolean {
  return new Set(approvedHealingHalfReplaceMonthKeys).has(monthKey);
}

export function canApplyHalfDayInMonth(
  monthKey: string,
  halfDayUsedByMonth: Record<string, number>,
  approvedHealingHalfReplaceMonthKeys: Iterable<string>,
): boolean {
  if (halfDayBlockedByApprovedHealing(monthKey, approvedHealingHalfReplaceMonthKeys)) return false;
  return (halfDayUsedByMonth[monthKey] ?? 0) < 1;
}

/** KPI·선택지 노출용 — 이번 달(·말 주면 다음 달) 중 하프데이 신청 가능한 달이 있는지 */
export function anyHalfDayMonthAvailable(
  todayYmd: string,
  halfDayUsedByMonth: Record<string, number>,
  approvedHealingHalfReplaceMonthKeys: Iterable<string>,
): boolean {
  const currentKey = monthKeyFromYmd(todayYmd);
  const keys = [currentKey];
  if (isInLastWeekOfMonthKst(todayYmd)) keys.push(nextMonthKey(currentKey));
  return keys.some((mk) => canApplyHalfDayInMonth(mk, halfDayUsedByMonth, approvedHealingHalfReplaceMonthKeys));
}

/** YYYY-MM (신청일·휴가일 월 키) */
export function monthKeyFromYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

export function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelFromKey(key: string): string {
  return `${Number(key.split("-")[1])}월`;
}

export function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** 해당 월 마지막 7일(말일 포함) — KST 달력 YMD */
export function isInLastWeekOfMonthKst(todayYmd?: string): boolean {
  const ymd = (todayYmd ?? todayKstYmd()).slice(0, 10);
  const [y, mo, day] = ymd.split("-").map(Number);
  if (!y || !mo || !day) return false;
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return day >= lastDay - 6;
}

export type HalfPoolMonthStatus = { monthKey: string; label: string; used: boolean };

export function halfPoolUsedInMonth(
  monthKey: string,
  halfDayUsedByMonth: Record<string, number>,
  healingHalfReplaceUsedByMonth: Record<string, number>,
): boolean {
  return (halfDayUsedByMonth[monthKey] ?? 0) > 0 || (healingHalfReplaceUsedByMonth[monthKey] ?? 0) > 0;
}

/** KPI: 선택한 월의 하프데이·하프대체 사용 여부 */
export function halfPoolKpiForMonth(
  monthKey: string,
  halfDayUsedByMonth: Record<string, number>,
  healingHalfReplaceUsedByMonth: Record<string, number>,
): HalfPoolKpiStack {
  const used = halfPoolUsedInMonth(monthKey, halfDayUsedByMonth, healingHalfReplaceUsedByMonth);
  const tag = "하프데이(대체)";
  return {
    title: `${monthLabelFromKey(monthKey)} ${tag}`,
    statusLabel: used ? "사용" : "미사용",
    used,
  };
}

/** @deprecated KPI는 HalfPoolKpiCell에서 월별 탐색 — 호환용 단일 월 */
export function buildHalfPoolKpiMonths(
  todayYmd: string,
  halfDayUsedByMonth: Record<string, number>,
  healingHalfReplaceUsedByMonth: Record<string, number>,
): HalfPoolMonthStatus[] {
  const currentKey = monthKeyFromYmd(todayYmd);
  return [
    {
      monthKey: currentKey,
      label: monthLabelFromKey(currentKey),
      used: halfPoolUsedInMonth(currentKey, halfDayUsedByMonth, healingHalfReplaceUsedByMonth),
    },
  ];
}

export function formatHalfPoolKpiText(months: HalfPoolMonthStatus[]): string {
  return months.map((m) => `${m.label} ${m.used ? "사용" : "미사용"}`).join(" · ");
}

/** KPI 소형 한 줄: "5월 하프데이(대체) 미사용" */
export function formatHalfPoolKpiCompact(months: HalfPoolMonthStatus[]): string {
  const tag = "하프데이(대체)";
  if (months.length === 0) return `${tag} —`;
  if (months.length === 1) {
    const m = months[0]!;
    return `${m.label} ${tag} ${m.used ? "사용" : "미사용"}`;
  }
  const allSameStatus = months.every((m) => m.used === months[0]!.used);
  if (allSameStatus) {
    const monthPart = months.map((m) => m.label.replace("월", "")).join("·") + "월";
    return `${monthPart} ${tag} ${months[0]!.used ? "사용" : "미사용"}`;
  }
  return months.map((m) => `${m.label} ${tag} ${m.used ? "사용" : "미사용"}`).join(" · ");
}

export type HalfPoolKpiStack = {
  title: string;
  statusLabel: "사용" | "미사용";
  used: boolean;
};

/** KPI 2줄 표시: 위 제목 · 아래 사용/미사용 강조 */
export function buildHalfPoolKpiStacks(months: HalfPoolMonthStatus[]): HalfPoolKpiStack[] {
  const tag = "하프데이(대체)";
  if (months.length === 0) {
    return [{ title: tag, statusLabel: "미사용", used: false }];
  }
  if (months.length === 1) {
    const m = months[0]!;
    return [{ title: `${m.label} ${tag}`, statusLabel: m.used ? "사용" : "미사용", used: m.used }];
  }
  const allSameStatus = months.every((m) => m.used === months[0]!.used);
  if (allSameStatus) {
    const monthPart = months.map((m) => m.label.replace("월", "")).join("·") + "월";
    return [
      {
        title: `${monthPart} ${tag}`,
        statusLabel: months[0]!.used ? "사용" : "미사용",
        used: months[0]!.used,
      },
    ];
  }
  return months.map((m) => ({
    title: `${m.label} ${tag}`,
    statusLabel: m.used ? "사용" : "미사용",
    used: m.used,
  }));
}

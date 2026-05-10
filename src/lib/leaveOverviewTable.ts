/**
 * 휴가 현황(관리자) 표: AllocationSourceConfig + 실제 할당 데이터로 열 구성
 */

import { isMonthlyAccrualRowNote } from "@/lib/monthlyAccrualNote";

export const OVERVIEW_MONTHLY_BUNDLE_KEY = "__BASE_ANNUAL_MONTHLY__";

export type OverviewAllocLike = {
  sourceCode: string;
  totalDays: number;
  usedDays: number;
  note?: string | null;
  isActive?: boolean | null;
};

export type OverviewAgg = { total: number; used: number };

function isMonthlyAccrualRow(a: OverviewAllocLike): boolean {
  return isMonthlyAccrualRowNote(a.note, a.sourceCode);
}

/** 직원 할당 목록 → 표시 키별 합산 (월별적립은 한 열로 묶음) */
export function aggregateAllocationsByOverviewKey(allocs: OverviewAllocLike[]): Map<string, OverviewAgg> {
  const map = new Map<string, OverviewAgg>();
  const add = (key: string, total: number, used: number) => {
    const cur = map.get(key) ?? { total: 0, used: 0 };
    cur.total += total;
    cur.used += used;
    map.set(key, cur);
  };

  for (const a of allocs) {
    if (a.isActive === false) continue;
    if (isMonthlyAccrualRow(a)) {
      add(OVERVIEW_MONTHLY_BUNDLE_KEY, Number(a.totalDays), Number(a.usedDays));
      continue;
    }
    add(a.sourceCode, Number(a.totalDays), Number(a.usedDays));
  }
  return map;
}

export type OverviewColumnDef = { key: string; label: string };

/** DB 메타에 없을 때 표시용 (스케줄러 전용 소스 등) */
const OVERVIEW_FALLBACK_SOURCE_LABELS: Record<string, string> = {
  BIRTHDAY_HALF: "생일반차",
  CARRYOVER: "이월연차",
};

/** 정수는 소수점 없이(3), 0.5 등만 소수 한 자리 */
export function formatLeaveDayDisplay(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  if (Number.isInteger(rounded) || Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return String(Math.round(rounded));
  }
  return rounded.toFixed(1);
}

/**
 * 활성 메타(AllocationSourceConfig) 전부를 sortOrder대로 열로 고정한다.
 * BASE_ANNUAL 바로 다음에 월별적립 묶음 열을 항상 둔다(데이터 없으면 0/0).
 * DB 메타에 없는데 할당에만 있는 sourceCode는 마지막에 알파벳 순.
 */
export function buildOverviewColumns(
  configs: { sourceCode: string; label: string; sortOrder: number }[],
  perEmployeeMaps: Map<string, OverviewAgg>[],
): OverviewColumnDef[] {
  const labelByCode = new Map(configs.map((c) => [c.sourceCode, c.label]));
  const unionKeys = new Set<string>();
  for (const m of perEmployeeMaps) {
    for (const k of m.keys()) unionKeys.add(k);
  }

  const sortedCfg = [...configs]
    .filter((c) => !c.sourceCode.startsWith("MONTHLY_ACCRUAL_"))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.sourceCode.localeCompare(b.sourceCode));

  const cols: OverviewColumnDef[] = [];
  const used = new Set<string>();

  for (const c of sortedCfg) {
    if (c.sourceCode === "CARRYOVER") continue;
    cols.push({ key: c.sourceCode, label: c.label });
    used.add(c.sourceCode);
    if (c.sourceCode === "BASE_ANNUAL") {
      cols.push({ key: OVERVIEW_MONTHLY_BUNDLE_KEY, label: "기본연차(월별적립)" });
      used.add(OVERVIEW_MONTHLY_BUNDLE_KEY);
    }
  }

  for (const k of [...unionKeys].filter((x) => !used.has(x)).sort()) {
    cols.push({
      key: k,
      label: labelByCode.get(k) ?? OVERVIEW_FALLBACK_SOURCE_LABELS[k] ?? k,
    });
  }
  return cols;
}

export function formatOverviewCell(agg: OverviewAgg | undefined): { line: string; title: string } {
  const total = agg?.total ?? 0;
  const used = agg?.used ?? 0;
  const rem = total - used;
  const title = `부여 ${formatLeaveDayDisplay(total)} / 사용 ${formatLeaveDayDisplay(used)} / 잔여 ${formatLeaveDayDisplay(rem)}`;
  return {
    line: `${formatLeaveDayDisplay(rem)}/${formatLeaveDayDisplay(total)}`,
    title,
  };
}

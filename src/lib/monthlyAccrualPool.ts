/**
 * 입사 1년 미만 월별 연차 적립 — 귀속연도당 BASE_ANNUAL **한 행**에 누적(ACCURED_MONTHS).
 * 스케줄러·귀속연도 초기화가 동일 규칙으로 맞춘다.
 */

import prisma from "@/lib/db";
import type { DB, DBTx } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getFiscalYear, kstMidnight, kstEndOfDay, kstMidnightFromYmd } from "@/lib/workdays";
import { fiscalPeriod } from "@/lib/leaveCalc";
import { kstYmd, ymMonthEndYmd, ymNext } from "@/lib/dateUtils";

// 순수 함수는 클라이언트 안전 파일에서 re-export
export {
  MONTHLY_ACCRUAL_POOL_MARKER,
  isPoolNote,
  isMonthlyAccrualRowNote,
  parseAccruedMonthsFromNote,
  buildPoolNote,
} from "@/lib/monthlyAccrualNote";
import {
  MONTHLY_ACCRUAL_POOL_MARKER,
  isPoolNote,
  parseAccruedMonthsFromNote,
  buildPoolNote,
} from "@/lib/monthlyAccrualNote";

export type MonthlyAccrualDb = DBTx | DB;

function isLegacyMonthlyNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return /MONTHLY_ACCRUAL:\d{4}-\d{2}/.test(note);
}

function legacySourceCodeToYm(sourceCode: string): string | null {
  if (!sourceCode.startsWith("MONTHLY_ACCRUAL_")) return null;
  const rest = sourceCode.slice("MONTHLY_ACCRUAL_".length);
  const [y, mo] = rest.split("_");
  if (!y || !mo) return null;
  return `${y}-${mo.padStart(2, "0")}`;
}

export function eligibleForMonth(hire: Date, tYear: number, tMonth: number): boolean {
  const mendYmd = ymMonthEndYmd(`${tYear}-${String(tMonth).padStart(2, "0")}`);
  const [ey, em, ed] = mendYmd.split("-").map(Number);
  const monthEnd = kstEndOfDay(ey, em, ed);
  if (hire > monthEnd) return false;
  const monthsWorked =
    (tYear - hire.getFullYear()) * 12 + (tMonth - (hire.getMonth() + 1));
  if (monthsWorked < 0 || monthsWorked >= 12) return false;
  // 월별 적립은 입사 귀속연도(부분 첫 FY) 내 달에서만 발생한다.
  // 다음 귀속연도부터는 귀속연도 초기화에서 BASE_ANNUAL 고정 부여로 전환.
  const hireFY = getFiscalYear(hire);
  const monthFirstYmd = `${tYear}-${String(tMonth).padStart(2, "0")}-01`;
  const targetFY = getFiscalYear(kstMidnightFromYmd(monthFirstYmd));
  if (targetFY !== hireFY) return false;
  return true;
}

/**
 * 귀속연도 초기화·월별 풀 동기화 상한일.
 * - KST 달력 기준 asOf가 속한 달의 말일(귀속 말일과 겹치면 귀속 말일)까지 월 키를 포함한다.
 * - 월별 스케줄러 기본 실행(인자 없음)은 **지난 달**만 `appendMonthlyAccrualMonth` 하지만,
 *   초기화는 “오늘 시점까지 누적”과 맞추기 위해 **당월**까지 반영한다(4/6이면 4월분 포함).
 */
export function monthlyAccrualCapDate(asOf: Date, fyEnd: Date): Date {
  const ymd = kstYmd(asOf);
  const lastYmd = ymMonthEndYmd(ymd.slice(0, 7));
  const [ey, em, ed] = lastYmd.split("-").map(Number);
  const endOfMonth = kstEndOfDay(ey, em, ed);
  return endOfMonth.getTime() < fyEnd.getTime() ? endOfMonth : fyEnd;
}

export function listEligibleMonthlyMonths(hire: Date, fy: number, capDate: Date): string[] {
  const { start: fyStart, end: fyEnd } = fiscalPeriod(fy);
  const fyStartYmd = kstYmd(fyStart);
  const fyEndYmd = kstYmd(fyEnd);
  const hireYmd = kstYmd(hire);
  const capYmd = kstYmd(capDate);

  const hireYm = hireYmd.slice(0, 7);
  const fyStYm = fyStartYmd.slice(0, 7);
  let ym = fyStYm > hireYm ? fyStYm : hireYm;
  const endYm = (capYmd <= fyEndYmd ? capYmd : fyEndYmd).slice(0, 7);

  const out: string[] = [];
  for (let guard = 0; guard < 48 && ym <= endYm; guard++) {
    const [tYear, tMonth] = ym.split("-").map(Number);
    const mend = ymMonthEndYmd(ym);
    if (mend > fyEndYmd) break;
    if (mend > capYmd) break;
    if (eligibleForMonth(hire, tYear, tMonth)) {
      out.push(`${tYear}-${String(tMonth).padStart(2, "0")}`);
    }
    ym = ymNext(ym);
  }
  return out;
}

export async function findMonthlyAccrualRows(
  db: MonthlyAccrualDb,
  employeeId: string,
  fiscalYear: number,
) {
  return db.leaveAllocation.findMany({
    where: {
      employeeId,
      fiscalYear,
      OR: [
        { sourceCode: "BASE_ANNUAL", note: { contains: MONTHLY_ACCRUAL_POOL_MARKER } },
        { sourceCode: "BASE_ANNUAL", note: { contains: "MONTHLY_ACCRUAL:" } },
        { sourceCode: { startsWith: "MONTHLY_ACCRUAL_" } },
      ],
    },
    orderBy: { validFrom: "asc" },
  });
}

export function collectMonthsFromRows(rows: { note: string | null; sourceCode: string }[]): Set<string> {
  const months = new Set<string>();
  for (const r of rows) {
    parseAccruedMonthsFromNote(r.note).forEach((m) => months.add(m));
    const ym = legacySourceCodeToYm(r.sourceCode);
    if (ym) months.add(ym);
  }
  return months;
}

/** 귀속연도 기본연차(정규 15일 등) — 월별 적립 행 제외 (note NULL은 정규로 간주) */
export async function regularBaseAnnualExists(
  db: MonthlyAccrualDb,
  employeeId: string,
  fiscalYear: number,
) {
  return db.leaveAllocation.findFirst({
    where: {
      employeeId,
      sourceCode: "BASE_ANNUAL",
      fiscalYear,
      OR: [
        { note: null },
        {
          AND: [
            { NOT: { note: { contains: MONTHLY_ACCRUAL_POOL_MARKER } } },
            { NOT: { note: { contains: "MONTHLY_ACCRUAL:" } } },
          ],
        },
      ],
    },
  });
}

const labelPool = "기본연차";

async function upsertSinglePool(
  db: MonthlyAccrualDb,
  params: {
    employeeId: string;
    fiscalYear: number;
    months: string[];
    usedDays: number;
    validFrom: Date;
    validUntil: Date;
    dryRun: boolean;
  },
): Promise<{ id: string } | null> {
  const { employeeId, fiscalYear, months, usedDays, validFrom, validUntil, dryRun } = params;
  const sorted = [...new Set(months)].sort();
  const totalDays = sorted.length;
  const u = Math.min(Math.max(0, usedDays), totalDays);
  const note = buildPoolNote(sorted);

  const rows = await findMonthlyAccrualRows(db, employeeId, fiscalYear);
  if (rows.length === 0) {
    if (dryRun) return { id: "dry" };
    const created = await db.leaveAllocation.create({
      data: {
        employeeId,
        fiscalYear,
        sourceCode: "BASE_ANNUAL",
        label: labelPool,
        totalDays,
        usedDays: u,
        validFrom,
        validUntil,
        isActive: true,
        note,
      },
    });
    return { id: created.id };
  }

  const keep = rows.find((r) => isPoolNote(r.note)) ?? rows[0]!;
  const deleteIds = rows.filter((r) => r.id !== keep.id).map((r) => r.id);
  if (dryRun) return { id: keep.id };

  if (deleteIds.length > 0) {
    await db.leaveAllocation.deleteMany({ where: { id: { in: deleteIds } } });
  }
  await db.leaveAllocation.update({
    where: { id: keep.id },
    data: {
      totalDays,
      usedDays: u,
      validFrom,
      validUntil,
      note,
      isActive: true,
      sourceCode: "BASE_ANNUAL",
      label: labelPool,
    },
  });
  return { id: keep.id };
}

/** 귀속연도 초기화·수동 동기화: cap 시점까지 누적 일수를 메타와 일치 */
export async function syncMonthlyAccrualPoolForFiscalInit(
  db: MonthlyAccrualDb,
  params: {
    employeeId: string;
    hireDate: Date;
    fiscalYear: number;
    asOf: Date;
    dryRun: boolean;
  },
): Promise<{ created: number; updated: number; skipped: number }> {
  const { employeeId, hireDate, fiscalYear: fy, asOf, dryRun } = params;
  const { end: fyEnd } = fiscalPeriod(fy);
  const cap = monthlyAccrualCapDate(asOf, fyEnd);
  const expected = listEligibleMonthlyMonths(hireDate, fy, cap);
  if (expected.length === 0) return { created: 0, updated: 0, skipped: 0 };

  const rows = await findMonthlyAccrualRows(db, employeeId, fy);
  const usedSum = rows.reduce((s, r) => s + Number(r.usedDays), 0);
  const firstYm = expected[0]!;
  const [fyY, fyM] = firstYm.split("-").map(Number);
  const validFrom = kstMidnight(fyY, fyM, 1);
  const validUntil = kstEndOfDay(fy + 1, 4, 30);

  const before = collectMonthsFromRows(rows);
  const expectedSet = new Set(expected);
  const same =
    before.size === expectedSet.size &&
    expected.every((m) => before.has(m)) &&
    rows.length === 1 &&
    isPoolNote(rows[0]?.note ?? "") &&
    Math.abs(Number(rows[0]?.totalDays ?? 0) - expected.length) < 0.01;
  if (same) return { created: 0, updated: 0, skipped: 0 };

  const hadNoPool = rows.length === 0;
  await upsertSinglePool(db, {
    employeeId,
    fiscalYear: fy,
    months: expected,
    usedDays: usedSum,
    validFrom,
    validUntil,
    dryRun,
  });

  if (dryRun) return { created: hadNoPool ? 1 : 0, updated: hadNoPool ? 0 : 1, skipped: 0 };
  return { created: hadNoPool ? 1 : 0, updated: hadNoPool ? 0 : 1, skipped: 0 };
}

/** 스케줄러: 해당 귀속 월 1일 적립 1일 — 기존 POOL에 월 키 추가 또는 신규 행 */
export async function appendMonthlyAccrualMonth(
  db: MonthlyAccrualDb,
  params: {
    employeeId: string;
    name?: string;
    hireDate: Date;
    targetYm: string;
    dryRun: boolean;
    actorId?: string | null;
  },
): Promise<"granted" | "skipped" | "reactivated"> {
  const { employeeId, name, hireDate, targetYm, dryRun, actorId } = params;
  const [tYear, tMonth] = targetYm.split("-").map(Number);
  if (!eligibleForMonth(hireDate, tYear, tMonth)) return "skipped";

  const monthStart = kstMidnight(tYear, tMonth, 1);
  const fy = getFiscalYear(monthStart);
  const { end: fyEnd } = fiscalPeriod(fy);
  const validUntil = kstEndOfDay(fy + 1, 4, 30);

  const rows = await findMonthlyAccrualRows(db, employeeId, fy);
  const usedSum = rows.reduce((s, r) => s + Number(r.usedDays), 0);
  let months = collectMonthsFromRows(rows);

  if (months.has(targetYm)) {
    const row = rows.find((r) => isPoolNote(r.note)) ?? rows[0];
    if (row && !row.isActive && row.validUntil >= new Date()) {
      if (!dryRun) {
        await db.leaveAllocation.update({
          where: { id: row.id },
          data: { isActive: true },
        });
        await writeAudit({
          entityType: "LeaveAllocation",
          entityId: row.id,
          action: "UPDATED",
          actorId: actorId ?? null,
          actorName: actorId ? undefined : "스케줄러(월별적립)",
          note: `${name ?? employeeId} ${targetYm} 월별 적립 비활성 건 복구`,
        });
      }
      return "reactivated";
    }
    return "skipped";
  }

  months.add(targetYm);
  const sorted = [...months].sort();
  const first = sorted[0]!;
  const [fyY, fyM] = first.split("-").map(Number);
  const validFrom = kstMidnight(fyY, fyM, 1);

  if (dryRun) return "granted";

  const hadRows = rows.length > 0;
  await upsertSinglePool(db, {
    employeeId,
    fiscalYear: fy,
    months: sorted,
    usedDays: usedSum,
    validFrom,
    validUntil,
    dryRun: false,
  });

  if (!hadRows) {
    const created = await findMonthlyAccrualRows(db, employeeId, fy);
    const id = created[0]?.id;
    if (id) {
      await writeAudit({
        entityType: "LeaveAllocation",
        entityId: id,
        action: "GRANTED",
        actorId: actorId ?? null,
        actorName: actorId ? undefined : "스케줄러(월별적립)",
        after: { sourceCode: "BASE_ANNUAL", totalDays: sorted.length, month: targetYm },
        note: `${name ?? employeeId} ${targetYm} 월별 연차 자동 적립`,
      });
    }
  } else {
    const id = (await findMonthlyAccrualRows(db, employeeId, fy))[0]?.id;
    if (id) {
      await writeAudit({
        entityType: "LeaveAllocation",
        entityId: id,
        action: "UPDATED",
        actorId: actorId ?? null,
        actorName: actorId ? undefined : "스케줄러(월별적립)",
        after: { sourceCode: "BASE_ANNUAL", totalDays: sorted.length, month: targetYm },
        note: `${name ?? employeeId} ${targetYm} 월별 연차 누적 (+1일)`,
      });
    }
  }
  return "granted";
}

/** 미리보기: 동기화가 필요하면 기대 일수 */
export async function previewMonthlyPoolSyncNeeded(
  db: MonthlyAccrualDb,
  employeeId: string,
  hireDate: Date,
  fiscalYear: number,
  asOf: Date,
): Promise<{ needed: boolean; expectedTotalDays: number }> {
  const { end: fyEnd } = fiscalPeriod(fiscalYear);
  const cap = monthlyAccrualCapDate(asOf, fyEnd);
  const expected = listEligibleMonthlyMonths(hireDate, fiscalYear, cap);
  if (expected.length === 0) return { needed: false, expectedTotalDays: 0 };

  const rows = await findMonthlyAccrualRows(db, employeeId, fiscalYear);
  if (rows.length === 0) return { needed: true, expectedTotalDays: expected.length };

  const before = collectMonthsFromRows(rows);
  const ok =
    before.size === expected.length &&
    expected.every((m) => before.has(m)) &&
    rows.length === 1 &&
    isPoolNote(rows[0]?.note ?? "") &&
    Math.abs(Number(rows[0]?.totalDays ?? 0) - expected.length) < 0.01;
  return { needed: !ok, expectedTotalDays: expected.length };
}

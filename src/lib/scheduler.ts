/**
 * 자동 스케줄러 비즈니스 로직
 *
 * 두 가지 작업:
 * 1. runMonthlyAccrual  — 매월 1일: 입사 1년 미만 직원에게 1일 연차 적립
 * 2. runTenureCheck     — 매일: 1·5·10년 근속 기념일 도래 직원에게 근속휴가 부여(귀속연도 초기화와는 별도·단일 출처)
 *
 * dryRun=true 이면 DB 변경 없이 "부여 예정자"만 반환합니다.
 */

import prisma from "@/lib/db";
import { writeAudit, writeSchedulerLog } from "@/lib/audit";
import { getFiscalYear, kstMidnightFromYmd, tenureMilestoneValidUntil } from "@/lib/workdays";
import { addCalendarYearsToYmd, kstYmd } from "@/lib/dateUtils";
import { findTenureMilestoneAllocation } from "@/lib/tenureAllocationDedupe";
import {
  formatTenureMilestoneAutoNote,
  getTenureMilestones,
  fiscalPeriod,
  DEFAULT_TENURE_MILESTONES,
  type TenureMilestoneConfig,
} from "@/lib/leaveCalc";
import { appendMonthlyAccrualMonth } from "@/lib/monthlyAccrualPool";
import { loadTenureMilestoneConfigs } from "@/lib/tenureMilestoneFromDb";

export interface AccrualItem {
  employeeId: string;
  name:       string;
  month:      string;
  days:       number;
  reason?:    string;   // skipped 사유
  error?:     string;
}
export interface AccrualResult {
  granted: AccrualItem[];
  skipped: AccrualItem[];
  errors:  AccrualItem[];
  isDryRun: boolean;
}

export interface TenureItem {
  employeeId:  string;
  name:        string;
  code:        string;
  days:        number;
  anniversary: string;
  reason?:     string;
  error?:      string;
}
export interface TenureResult {
  granted: TenureItem[];
  skipped: TenureItem[];
  errors:  TenureItem[];
  isDryRun: boolean;
}

// ──────────────────────────────────────────────────────
// 월별 연차 적립 미리보기 (항상 dry-run과 동일한 로직)
// ──────────────────────────────────────────────────────
export async function previewMonthlyAccrual(targetMonth?: string) {
  return runMonthlyAccrual(targetMonth, true);
}

export async function previewTenureCheck(targetDate?: string, window = 0) {
  return runTenureCheck(targetDate, window, true);
}

// ──────────────────────────────────────────────────────
// 1. 월별 연차 적립
// ──────────────────────────────────────────────────────
export async function runMonthlyAccrual(
  targetMonth?: string,
  dryRun = false,
  actorId?: string,
): Promise<AccrualResult> {
  const result: AccrualResult = { granted: [], skipped: [], errors: [], isDryRun: dryRun };

  const now = new Date();
  let tYear: number, tMonth: number;
  if (targetMonth) {
    [tYear, tMonth] = targetMonth.split("-").map(Number);
  } else {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    tYear  = prev.getFullYear();
    tMonth = prev.getMonth() + 1;
  }
  const monthStr   = `${tYear}-${String(tMonth).padStart(2, "0")}`;
  const monthEnd   = new Date(tYear, tMonth, 0);

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE", employeeType: { not: "EXTERNAL" } },
  });

  for (const emp of employees) {
    const hire = new Date(emp.hireDate);

    const monthsWorked =
      (tYear - hire.getFullYear()) * 12 + (tMonth - (hire.getMonth() + 1));

    if (monthsWorked >= 12) {
      result.skipped.push({ employeeId: emp.id, name: emp.name, month: monthStr, days: 1, reason: "입사 1년 이상" });
      continue;
    }
    if (monthsWorked < 0 || hire > monthEnd) {
      result.skipped.push({ employeeId: emp.id, name: emp.name, month: monthStr, days: 1, reason: "해당 월 입사 전" });
      continue;
    }

    try {
      const out = await appendMonthlyAccrualMonth(prisma, {
        employeeId: emp.id,
        name: emp.name,
        hireDate: hire,
        targetYm: monthStr,
        dryRun,
        actorId,
      });
      if (out === "granted") {
        result.granted.push({ employeeId: emp.id, name: emp.name, month: monthStr, days: 1 });
      } else if (out === "reactivated") {
        result.granted.push({
          employeeId: emp.id,
          name: emp.name,
          month: monthStr,
          days: 1,
          reason: "비활성 기존 적립 복구",
        });
      } else {
        result.skipped.push({ employeeId: emp.id, name: emp.name, month: monthStr, days: 1, reason: "이미 적립됨" });
      }
    } catch (e: unknown) {
      result.errors.push({
        employeeId: emp.id, name: emp.name, month: monthStr, days: 1,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!dryRun) {
    const st = result.errors.length > 0
      ? (result.granted.length > 0 ? "PARTIAL" : "FAILED")
      : "SUCCESS";
    await writeSchedulerLog({
      jobName: "monthly_accrual", targetParam: monthStr,
      isDryRun: false, status: st,
      grantedCount: result.granted.length,
      skippedCount: result.skipped.length,
      errorCount:   result.errors.length,
      detail: result, triggeredBy: actorId ? "ADMIN" : "SYSTEM", actorId,
    });
  }

  return result;
}

// ──────────────────────────────────────────────────────
// 2. 근속 기념일 체크
// ──────────────────────────────────────────────────────

/** LeaveType.hireAnniversaryYears 우선, 없으면 AllocationSourceConfig.tenureYears, 실패 시 기본 목록 */
async function loadTenureMilestones(): Promise<TenureMilestoneConfig[]> {
  try {
    const cfgs = await loadTenureMilestoneConfigs(prisma);
    if (cfgs.length > 0) return cfgs;
  } catch {
    /* DB 조회 실패 */
  }
  return DEFAULT_TENURE_MILESTONES;
}

export async function runTenureCheck(
  targetDate?: string,
  window = 0,
  dryRun = false,
  actorId?: string,
): Promise<TenureResult> {
  const result: TenureResult = { granted: [], skipped: [], errors: [], isDryRun: dryRun };

  const TENURE_MILESTONES = await loadTenureMilestones();

  const target = targetDate ? new Date(targetDate) : new Date();
  target.setHours(0, 0, 0, 0);
  const checkFrom = new Date(target); checkFrom.setDate(checkFrom.getDate() - window);
  const checkTo   = new Date(target); checkTo.setDate(checkTo.getDate() + window);

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE", employeeType: { not: "EXTERNAL" } },
  });

  for (const emp of employees) {
    const hire = new Date(emp.hireDate);
    const hireYmd = kstYmd(hire);

    for (const m of TENURE_MILESTONES) {
      const anniversaryYmd = addCalendarYearsToYmd(hireYmd, m.years);
      const grantStart = kstMidnightFromYmd(anniversaryYmd);
      if (grantStart < checkFrom || grantStart > checkTo) continue;

      const existing = await findTenureMilestoneAllocation(prisma, emp.id, m.code, anniversaryYmd);
      if (existing) {
        result.skipped.push({
          employeeId: emp.id, name: emp.name,
          code: m.code, days: m.days, anniversary: anniversaryYmd,
          reason: "이미 부여됨",
        });
        continue;
      }

      if (dryRun) {
        result.granted.push({
          employeeId: emp.id, name: emp.name, code: m.code, days: m.days, anniversary: anniversaryYmd,
        });
        continue;
      }

      const validFrom = grantStart;
      const validUntil = tenureMilestoneValidUntil(validFrom, m.years);
      const fiscalYear = null;

      try {
        const alloc = await prisma.leaveAllocation.create({
          data: {
            employeeId: emp.id, fiscalYear, sourceCode: m.code,
            label: m.label, totalDays: m.days, usedDays: 0,
            validFrom, validUntil, isActive: true,
            note: formatTenureMilestoneAutoNote(anniversaryYmd, m.years),
          },
        });
        await writeAudit({
          entityType: "LeaveAllocation", entityId: alloc.id,
          action: "GRANTED", actorId: actorId ?? null,
          actorName: actorId ? undefined : "스케줄러(근속)",
          after: { sourceCode: m.code, totalDays: m.days, anniversary: anniversaryYmd },
          note: `${emp.name} ${m.years}년 근속휴가 자동 부여`,
        });
        result.granted.push({
          employeeId: emp.id, name: emp.name, code: m.code, days: m.days, anniversary: anniversaryYmd,
        });
      } catch (e: unknown) {
        result.errors.push({
          employeeId: emp.id, name: emp.name, code: m.code, days: m.days, anniversary: anniversaryYmd,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  if (!dryRun) {
    const st = result.errors.length > 0
      ? (result.granted.length > 0 ? "PARTIAL" : "FAILED")
      : "SUCCESS";
    await writeSchedulerLog({
      jobName: "tenure_check",
      targetParam: `${kstYmd(target)}±${window}`,
      isDryRun: false, status: st,
      grantedCount: result.granted.length,
      skippedCount: result.skipped.length,
      errorCount:   result.errors.length,
      detail: result, triggeredBy: actorId ? "ADMIN" : "SYSTEM", actorId,
    });
  }

  return result;
}

// ──────────────────────────────────────────────────────
// 향후 N일 이내 기념일 예정자 조회
// ──────────────────────────────────────────────────────
export async function getUpcomingAnniversaries(days = 30) {
  const TENURE_MILESTONES = await loadTenureMilestones();

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const until = new Date(today); until.setDate(until.getDate() + days);

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE", employeeType: { not: "EXTERNAL" } },
    include: { team: { select: { name: true } } },
  });

  const upcoming: {
    employeeId: string; name: string; teamName: string; code: string;
    label: string; years: number; days: number; anniversary: string; daysLeft: number;
    alreadyGranted: boolean;
  }[] = [];

  for (const emp of employees) {
    const hireYmd = kstYmd(new Date(emp.hireDate));
    for (const m of TENURE_MILESTONES) {
      const anniversaryYmd = addCalendarYearsToYmd(hireYmd, m.years);
      const grantStart = kstMidnightFromYmd(anniversaryYmd);
      if (grantStart < today || grantStart > until) continue;

      const daysLeft = Math.ceil((grantStart.getTime() - today.getTime()) / 86400000);

      const existing = await findTenureMilestoneAllocation(prisma, emp.id, m.code, anniversaryYmd);

      upcoming.push({
        employeeId: emp.id, name: emp.name, teamName: emp.team?.name ?? "-",
        code: m.code, label: m.label, years: m.years, days: m.days,
        anniversary: anniversaryYmd, daysLeft, alreadyGranted: !!existing,
      });
    }
  }

  return upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
}

// ──────────────────────────────────────────────────────
// 이번 귀속연도 + 다음 귀속연도 근속휴가 예정 (아직 부여 전인 것 포함)
// 스케줄러가 실제 부여할 시점과 동일한 기준으로 산정
// ──────────────────────────────────────────────────────
export interface TenureScheduleRow {
  fiscalYear: number;
  employeeId: string;
  name: string;
  teamName: string;
  code: string;
  label: string;
  days: number;
  grantDate: string;  // YYYY-MM-DD
  alreadyGranted: boolean;
}

export async function getTenureScheduleForFiscalYears(fy?: number): Promise<TenureScheduleRow[]> {
  const milestoneCfgs = await loadTenureMilestones();
  const currentFy = fy ?? getFiscalYear();
  const rows: TenureScheduleRow[] = [];

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE", employeeType: { not: "EXTERNAL" } },
    include: { team: { select: { name: true } } },
  });

  for (const emp of employees) {
    const hire = new Date(emp.hireDate);
    const teamName = emp.team?.name ?? "-";

    for (const yearOffset of [0, 1] as const) {
      const targetFy = currentFy + yearOffset;
      const { start: fyStart, end: fyEnd } = fiscalPeriod(targetFy);
      const milestones = getTenureMilestones(hire, fyStart, fyEnd, milestoneCfgs);

      for (const m of milestones) {
        const existing = await findTenureMilestoneAllocation(prisma, emp.id, m.code, m.anniversaryYmd);

        rows.push({
          fiscalYear: targetFy,
          employeeId: emp.id,
          name: emp.name,
          teamName,
          code: m.code,
          label: m.label,
          days: m.days,
          grantDate: m.anniversaryYmd,
          alreadyGranted: !!existing,
        });
      }
    }
  }

  rows.sort((a, b) => a.grantDate.localeCompare(b.grantDate) || a.name.localeCompare(b.name));
  return rows;
}

// ──────────────────────────────────────────────────────
// 3. 생일반차쿠폰 (일 단위 권장: 선택한 달력 날짜에 생일인 직원만 부여)
// ──────────────────────────────────────────────────────
export interface BirthdayHalfItem {
  employeeId: string;
  name: string;
  birthMonth: number;
  /** 부여·미리보기용 달력 생일 YYYY-MM-DD */
  birthdayDateStr?: string;
  reason?: string;
  error?: string;
}
export interface BirthdayHalfResult {
  granted: BirthdayHalfItem[];
  skipped: BirthdayHalfItem[];
  errors: BirthdayHalfItem[];
  isDryRun: boolean;
}

export type RunBirthdayHalfArgs = {
  /** YYYY-MM-DD — 이 날짜(월·일)에 생일이 맞는 직원만 부여 */
  date?: string;
  /** YYYY-MM — 레거시·배치: 해당 월 생일자 전원 (월 단위) */
  yearMonth?: string;
  dryRun?: boolean;
  actorId?: string;
};

export async function runBirthdayHalf(args: RunBirthdayHalfArgs = {}): Promise<BirthdayHalfResult> {
  const { date: dateRaw, yearMonth: yearMonthRaw, dryRun = false, actorId } = args;
  const result: BirthdayHalfResult = { granted: [], skipped: [], errors: [], isDryRun: dryRun };
  const now = new Date();

  const dateTrim = dateRaw?.trim();
  const ymTrim = yearMonthRaw?.trim();

  type Mode = { kind: "day"; tYear: number; tMonth: number; tDay: number; targetParam: string }
    | { kind: "month"; tYear: number; tMonth: number; targetParam: string };

  let mode: Mode;
  if (dateTrim && /^\d{4}-\d{2}-\d{2}$/.test(dateTrim)) {
    const [y, m, d] = dateTrim.split("-").map(Number);
    mode = { kind: "day", tYear: y, tMonth: m, tDay: d, targetParam: dateTrim };
  } else if (ymTrim && /^\d{4}-\d{2}$/.test(ymTrim)) {
    const [y, m] = ymTrim.split("-").map(Number);
    mode = { kind: "month", tYear: y, tMonth: m, targetParam: ymTrim };
  } else if (!dateTrim && !ymTrim) {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const p = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    mode = { kind: "day", tYear: y, tMonth: m, tDay: d, targetParam: p };
  } else {
    throw new Error("생일반차: date는 YYYY-MM-DD, yearMonth는 YYYY-MM 형식이어야 합니다.");
  }

  // 유효기간: LeaveType.validityMonths (BIRTHDAY_HALF) 기준, 없으면 3개월 폴백
  const birthdayHalfLT = await prisma.leaveType.findFirst({
    where: { code: "BIRTHDAY_HALF", isActive: true },
    select: { validityMonths: true, daysPerUnit: true },
  });
  const validityMonths = birthdayHalfLT?.validityMonths ?? 3;
  const daysPerUnit = Number(birthdayHalfLT?.daysPerUnit ?? 0.5);

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE", birthDate: { not: null }, employeeType: { not: "EXTERNAL" } },
  });

  for (const emp of employees) {
    const birth = emp.birthDate ? new Date(emp.birthDate) : null;
    if (!birth) {
      result.skipped.push({
        employeeId: emp.id,
        name: emp.name,
        birthMonth: 0,
        reason: "생년월일 미입력",
      });
      continue;
    }

    const birthMonth0 = birth.getMonth();
    const birthDay = birth.getDate();
    const tYear = mode.tYear;
    const maxDayInBirthMonth = new Date(tYear, birthMonth0 + 1, 0).getDate();
    const safeDay = Math.min(birthDay, maxDayInBirthMonth);
    const birthdayThisYear = new Date(tYear, birthMonth0, safeDay);
    const birthdayDateStr = `${tYear}-${String(birthMonth0 + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;

    if (mode.kind === "day") {
      if (birthMonth0 + 1 !== mode.tMonth || safeDay !== mode.tDay) {
        result.skipped.push({
          employeeId: emp.id,
          name: emp.name,
          birthMonth: birthMonth0 + 1,
          reason: "해당 일 생일 아님",
        });
        continue;
      }
    } else {
      if (birthMonth0 + 1 !== mode.tMonth) {
        result.skipped.push({
          employeeId: emp.id,
          name: emp.name,
          birthMonth: birthMonth0 + 1,
          reason: "해당 월 생일 아님",
        });
        continue;
      }
    }

    const existing = await prisma.leaveAllocation.findFirst({
      where: {
        employeeId: emp.id,
        sourceCode: "BIRTHDAY_HALF",
        note: { contains: birthdayDateStr },
      },
    });
    if (existing) {
      result.skipped.push({
        employeeId: emp.id,
        name: emp.name,
        birthMonth: birthMonth0 + 1,
        birthdayDateStr,
        reason: "이미 부여됨",
      });
      continue;
    }

    if (dryRun) {
      result.granted.push({
        employeeId: emp.id,
        name: emp.name,
        birthMonth: birthMonth0 + 1,
        birthdayDateStr,
      });
      continue;
    }

    try {
      const validUntil = new Date(birthdayThisYear);
      validUntil.setMonth(validUntil.getMonth() + validityMonths);
      validUntil.setDate(validUntil.getDate() - 1);
      validUntil.setHours(23, 59, 59, 999);
      await prisma.leaveAllocation.create({
        data: {
          employeeId: emp.id,
          sourceCode: "BIRTHDAY_HALF",
          label: "생일반차",
          totalDays: daysPerUnit,
          usedDays: 0,
          validFrom: birthdayThisYear,
          validUntil,
          fiscalYear: null,
          isActive: true,
          note: `생일반차 ${birthdayDateStr} 부여 (부여일 기준 ${validityMonths}개월)`,
        },
      });
      await writeAudit({
        entityType: "LeaveAllocation",
        entityId: emp.id,
        action: "GRANTED",
        actorId: actorId ?? null,
        actorName: actorId ? undefined : "스케줄러(생일반차)",
        after: { sourceCode: "BIRTHDAY_HALF", totalDays: daysPerUnit, birthday: birthdayDateStr },
        note: `${emp.name} ${birthdayDateStr} 생일반차 부여`,
      });
      result.granted.push({
        employeeId: emp.id,
        name: emp.name,
        birthMonth: birthMonth0 + 1,
        birthdayDateStr,
      });
    } catch (e: unknown) {
      result.errors.push({
        employeeId: emp.id,
        name: emp.name,
        birthMonth: birthMonth0 + 1,
        birthdayDateStr,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!dryRun) {
    const st =
      result.errors.length > 0
        ? result.granted.length > 0
          ? "PARTIAL"
          : "FAILED"
        : "SUCCESS";
    await writeSchedulerLog({
      jobName: "birthday_half",
      targetParam: mode.targetParam,
      isDryRun: false,
      status: st,
      grantedCount: result.granted.length,
      skippedCount: result.skipped.length,
      errorCount: result.errors.length,
      detail: result,
      triggeredBy: actorId ? "ADMIN" : "SYSTEM",
      actorId,
    });
  }

  return result;
}

// 이번 달 월별 적립 예정자
export async function getAccrualCandidates(targetMonth?: string) {
  const now = new Date();
  let tYear: number, tMonth: number;
  if (targetMonth) {
    [tYear, tMonth] = targetMonth.split("-").map(Number);
  } else {
    tYear  = now.getFullYear();
    tMonth = now.getMonth() + 1;
  }
  const monthStr   = `${tYear}-${String(tMonth).padStart(2, "0")}`;
  const monthEnd   = new Date(tYear, tMonth, 0);

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: { team: { select: { name: true } } },
  });

  const { findMonthlyAccrualRows, collectMonthsFromRows, eligibleForMonth } =
    await import("@/lib/monthlyAccrualPool");

  const candidates: {
    employeeId: string; name: string; teamName: string;
    hireDate: string; monthsWorked: number; alreadyGranted: boolean;
  }[] = [];

  for (const emp of employees) {
    const hire = new Date(emp.hireDate);
    const monthsWorked =
      (tYear - hire.getFullYear()) * 12 + (tMonth - (hire.getMonth() + 1));
    if (monthsWorked < 0 || monthsWorked >= 12 || hire > monthEnd) continue;
    if (!eligibleForMonth(hire, tYear, tMonth)) continue;

    const monthStart = new Date(tYear, tMonth - 1, 1);
    const fy = getFiscalYear(monthStart);
    const rows = await findMonthlyAccrualRows(prisma, emp.id, fy);
    const months = collectMonthsFromRows(rows);
    const alreadyGranted = months.has(monthStr);

    candidates.push({
      employeeId: emp.id, name: emp.name, teamName: emp.team?.name ?? "-",
      hireDate: kstYmd(hire),
      monthsWorked, alreadyGranted,
    });
  }

  return { monthStr, candidates };
}

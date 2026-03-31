/**
 * 자동 스케줄러 비즈니스 로직
 *
 * 두 가지 작업:
 * 1. runMonthlyAccrual  — 매월 1일: 입사 1년 미만 직원에게 1일 연차 적립
 * 2. runTenureCheck     — 매일: 1·5·10년 근속 기념일 도래 직원에게 근속휴가 부여
 *
 * dryRun=true 이면 DB 변경 없이 "부여 예정자"만 반환합니다.
 */

import prisma from "@/lib/db";
import { writeAudit, writeSchedulerLog } from "@/lib/audit";
import { getFiscalYear } from "@/lib/workdays";
import { getTenureMilestones, fiscalPeriod } from "@/lib/leaveCalc";

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
  const sourceCode = "BASE_ANNUAL";
  const monthlyAccrualNoteKey = `MONTHLY_ACCRUAL:${monthStr}`;
  const monthStart = new Date(tYear, tMonth - 1, 1);
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

    const existing = await prisma.leaveAllocation.findFirst({
      where: {
        employeeId: emp.id,
        OR: [
          // 신규 표준: 월별 적립도 BASE_ANNUAL로 적재, note 키로 월 구분
          { sourceCode, note: { contains: monthlyAccrualNoteKey } },
          // 레거시 호환
          { sourceCode: `MONTHLY_ACCRUAL_${tYear}_${String(tMonth).padStart(2, "0")}` },
        ],
      },
    });
    if (existing) {
      const canReactivate = !existing.isActive && existing.validUntil >= now;
      if (canReactivate) {
        if (dryRun) {
          result.granted.push({
            employeeId: emp.id,
            name: emp.name,
            month: monthStr,
            days: 1,
            reason: "비활성 기존 적립 복구 예정",
          });
        } else {
          await prisma.leaveAllocation.update({
            where: { id: existing.id },
            data: { isActive: true },
          });
          await writeAudit({
            entityType: "LeaveAllocation",
            entityId: existing.id,
            action: "UPDATED",
            actorId: actorId ?? null,
            actorName: actorId ? undefined : "스케줄러(월별적립)",
            note: `${emp.name} ${monthStr} 월별 적립 비활성 건 복구`,
          });
          result.granted.push({
            employeeId: emp.id,
            name: emp.name,
            month: monthStr,
            days: 1,
            reason: "비활성 기존 적립 복구",
          });
        }
      } else {
        const reason = existing.validFrom > now
          ? "이미 적립됨(유효 시작 전)"
          : "이미 적립됨";
        result.skipped.push({ employeeId: emp.id, name: emp.name, month: monthStr, days: 1, reason });
      }
      continue;
    }

    if (dryRun) {
      result.granted.push({ employeeId: emp.id, name: emp.name, month: monthStr, days: 1 });
      continue;
    }

    const fy         = getFiscalYear(monthStart);
    const validFrom  = monthStart;
    const validUntil = new Date(`${fy + 1}-04-30`);

    try {
      const alloc = await prisma.leaveAllocation.create({
        data: {
          employeeId: emp.id, fiscalYear: fy, sourceCode,
          label:      "기본연차",
          totalDays:  1, usedDays: 0,
          validFrom, validUntil, isActive: true,
          note: `${monthlyAccrualNoteKey} · 월별 연차 자동 적립 (입사 1년 미만)`,
        },
      });
      await writeAudit({
        entityType: "LeaveAllocation", entityId: alloc.id,
        action: "GRANTED", actorId: actorId ?? null,
        actorName: actorId ? undefined : "스케줄러(월별적립)",
        after: { sourceCode, totalDays: 1, month: monthStr },
        note: `${emp.name} ${monthStr} 월별 연차 자동 적립`,
      });
      result.granted.push({ employeeId: emp.id, name: emp.name, month: monthStr, days: 1 });
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
const TENURE_MILESTONES = [
  { years: 1,  code: "TENURE_1Y",  label: "1년근속휴가",  days: 3 },
  { years: 5,  code: "TENURE_5Y",  label: "5년근속휴가",  days: 5 },
  { years: 10, code: "TENURE_10Y", label: "10년근속휴가", days: 10 },
] as const;

export async function runTenureCheck(
  targetDate?: string,
  window = 0,
  dryRun = false,
  actorId?: string,
): Promise<TenureResult> {
  const result: TenureResult = { granted: [], skipped: [], errors: [], isDryRun: dryRun };

  const target = targetDate ? new Date(targetDate) : new Date();
  target.setHours(0, 0, 0, 0);
  const checkFrom = new Date(target); checkFrom.setDate(checkFrom.getDate() - window);
  const checkTo   = new Date(target); checkTo.setDate(checkTo.getDate() + window);

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE", employeeType: { not: "EXTERNAL" } },
  });

  for (const emp of employees) {
    const hire = new Date(emp.hireDate); hire.setHours(0, 0, 0, 0);

    for (const m of TENURE_MILESTONES) {
      const anniversary = new Date(hire);
      anniversary.setFullYear(hire.getFullYear() + m.years);
      if (anniversary < checkFrom || anniversary > checkTo) continue;

      const anniversaryStr = anniversary.toISOString().slice(0, 10);

      const existing = await prisma.leaveAllocation.findFirst({
        where: { employeeId: emp.id, sourceCode: m.code, note: { contains: anniversaryStr } },
      });
      if (existing) {
        result.skipped.push({
          employeeId: emp.id, name: emp.name,
          code: m.code, days: m.days, anniversary: anniversaryStr,
          reason: "이미 부여됨",
        });
        continue;
      }

      if (dryRun) {
        result.granted.push({ employeeId: emp.id, name: emp.name, code: m.code, days: m.days, anniversary: anniversaryStr });
        continue;
      }

      const validFrom  = anniversary;
      // 스케줄러는 "부여 + 기본 만료일 세팅"만 담당.
      // 1년근속 특례 이월은 귀속연도 초기화(init) 정책에서 처리한다.
      let validUntil: Date;
      if (m.code === "TENURE_1Y") {
        const fiscalYearOfGrant = getFiscalYear(anniversary); // anniversary가 속한 귀속연도
        const fyEnd = new Date(fiscalYearOfGrant + 1, 3, 30, 23, 59, 59, 999); // (fy+1)-04-30 23:59:59.999
        validUntil = fyEnd;
      } else {
        const d = new Date(anniversary);
        d.setMonth(d.getMonth() + 12);
        validUntil = d;
      }
      // 근속휴가는 입사 기념일 기준이라 귀속연도 없음 (스케줄러 전용)
      const fiscalYear = null;

      try {
        const alloc = await prisma.leaveAllocation.create({
          data: {
            employeeId: emp.id, fiscalYear, sourceCode: m.code,
            label: m.label, totalDays: m.days, usedDays: 0,
            validFrom, validUntil, isActive: true,
            note: `${anniversaryStr} 자동 부여 (입사 ${m.years}년 근속)`,
          },
        });
        await writeAudit({
          entityType: "LeaveAllocation", entityId: alloc.id,
          action: "GRANTED", actorId: actorId ?? null,
          actorName: actorId ? undefined : "스케줄러(근속)",
          after: { sourceCode: m.code, totalDays: m.days, anniversary: anniversaryStr },
          note: `${emp.name} ${m.years}년 근속휴가 자동 부여`,
        });
        result.granted.push({ employeeId: emp.id, name: emp.name, code: m.code, days: m.days, anniversary: anniversaryStr });
      } catch (e: unknown) {
        result.errors.push({
          employeeId: emp.id, name: emp.name, code: m.code, days: m.days, anniversary: anniversaryStr,
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
      targetParam: `${target.toISOString().slice(0,10)}±${window}`,
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
    const hire = new Date(emp.hireDate); hire.setHours(0, 0, 0, 0);
    for (const m of TENURE_MILESTONES) {
      const anniversary = new Date(hire);
      anniversary.setFullYear(hire.getFullYear() + m.years);
      if (anniversary < today || anniversary > until) continue;

      const anniversaryStr = anniversary.toISOString().slice(0, 10);
      const daysLeft = Math.ceil((anniversary.getTime() - today.getTime()) / 86400000);

      const existing = await prisma.leaveAllocation.findFirst({
        where: { employeeId: emp.id, sourceCode: m.code, note: { contains: anniversaryStr } },
      });

      upcoming.push({
        employeeId: emp.id, name: emp.name, teamName: emp.team?.name ?? "-",
        code: m.code, label: m.label, years: m.years, days: m.days,
        anniversary: anniversaryStr, daysLeft, alreadyGranted: !!existing,
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
      const milestones = getTenureMilestones(hire, fyStart, fyEnd);

      for (const m of milestones) {
        const grantDateStr = m.grantDate.toISOString().slice(0, 10);
        const existing = await prisma.leaveAllocation.findFirst({
          where: {
            employeeId: emp.id,
            sourceCode: m.code,
            note: { contains: grantDateStr },
          },
        });

        rows.push({
          fiscalYear: targetFy,
          employeeId: emp.id,
          name: emp.name,
          teamName,
          code: m.code,
          label: m.label,
          days: m.days,
          grantDate: grantDateStr,
          alreadyGranted: !!existing,
        });
      }
    }
  }

  rows.sort((a, b) => a.grantDate.localeCompare(b.grantDate) || a.name.localeCompare(b.name));
  return rows;
}

// ──────────────────────────────────────────────────────
// 3. 생일반차쿠폰 (해당 월에 생일인 재직자에게 0.5일 부여)
// ──────────────────────────────────────────────────────
export interface BirthdayHalfItem {
  employeeId: string;
  name: string;
  birthMonth: number;
  reason?: string;
  error?: string;
}
export interface BirthdayHalfResult {
  granted: BirthdayHalfItem[];
  skipped: BirthdayHalfItem[];
  errors: BirthdayHalfItem[];
  isDryRun: boolean;
}

export async function runBirthdayHalf(
  targetYearMonth?: string,
  dryRun = false,
  actorId?: string,
): Promise<BirthdayHalfResult> {
  const result: BirthdayHalfResult = { granted: [], skipped: [], errors: [], isDryRun: dryRun };
  const now = new Date();
  let tYear: number, tMonth: number;
  if (targetYearMonth) {
    [tYear, tMonth] = targetYearMonth.split("-").map(Number);
  } else {
    tYear = now.getFullYear();
    tMonth = now.getMonth() + 1;
  }
  const yearMonthStr = `${tYear}-${String(tMonth).padStart(2, "0")}`;
  const monthStart = new Date(tYear, tMonth - 1, 1);
  const monthEnd = new Date(tYear, tMonth, 0);

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE", birthDate: { not: null }, employeeType: { not: "EXTERNAL" } },
  });

  for (const emp of employees) {
    const birth = emp.birthDate ? new Date(emp.birthDate) : null;
    if (!birth || birth.getMonth() + 1 !== tMonth) {
      result.skipped.push({
        employeeId: emp.id,
        name: emp.name,
        birthMonth: birth ? birth.getMonth() + 1 : 0,
        reason: !birth ? "생년월일 미입력" : "해당 월 생일 아님",
      });
      continue;
    }

    const existing = await prisma.leaveAllocation.findFirst({
      where: {
        employeeId: emp.id,
        sourceCode: "BIRTHDAY_HALF",
        note: { contains: `${tYear}년` },
      },
    });
    if (existing) {
      result.skipped.push({ employeeId: emp.id, name: emp.name, birthMonth: tMonth, reason: "이미 부여됨" });
      continue;
    }

    if (dryRun) {
      result.granted.push({ employeeId: emp.id, name: emp.name, birthMonth: tMonth });
      continue;
    }

    try {
      await prisma.leaveAllocation.create({
        data: {
          employeeId: emp.id,
          sourceCode: "BIRTHDAY_HALF",
          label: "생일반차",
          totalDays: 0.5,
          usedDays: 0,
          validFrom: monthStart,
          validUntil: monthEnd,
          fiscalYear: null,
          isActive: true,
          note: `${tYear}년 ${tMonth}월 생일반차`,
        },
      });
      await writeAudit({
        entityType: "LeaveAllocation",
        entityId: emp.id,
        action: "GRANTED",
        actorId: actorId ?? null,
        actorName: actorId ? undefined : "스케줄러(생일반차)",
        after: { sourceCode: "BIRTHDAY_HALF", totalDays: 0.5, yearMonth: yearMonthStr },
        note: `${emp.name} ${tYear}년 ${tMonth}월 생일반차 부여`,
      });
      result.granted.push({ employeeId: emp.id, name: emp.name, birthMonth: tMonth });
    } catch (e: unknown) {
      result.errors.push({
        employeeId: emp.id,
        name: emp.name,
        birthMonth: tMonth,
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
      targetParam: yearMonthStr,
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
  const sourceCode = "BASE_ANNUAL";
  const monthlyAccrualNoteKey = `MONTHLY_ACCRUAL:${monthStr}`;
  const monthEnd   = new Date(tYear, tMonth, 0);

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: { team: { select: { name: true } } },
  });

  const candidates: {
    employeeId: string; name: string; teamName: string;
    hireDate: string; monthsWorked: number; alreadyGranted: boolean;
  }[] = [];

  for (const emp of employees) {
    const hire = new Date(emp.hireDate);
    const monthsWorked =
      (tYear - hire.getFullYear()) * 12 + (tMonth - (hire.getMonth() + 1));
    if (monthsWorked < 0 || monthsWorked >= 12 || hire > monthEnd) continue;

    const existing = await prisma.leaveAllocation.findFirst({
      where: {
        employeeId: emp.id,
        OR: [
          { sourceCode, note: { contains: monthlyAccrualNoteKey } },
          { sourceCode: `MONTHLY_ACCRUAL_${tYear}_${String(tMonth).padStart(2, "0")}` },
        ],
      },
    });

    candidates.push({
      employeeId: emp.id, name: emp.name, teamName: emp.team?.name ?? "-",
      hireDate: hire.toISOString().slice(0, 10),
      monthsWorked, alreadyGranted: !!existing,
    });
  }

  return { monthStr, candidates };
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { fiscalPeriod, getTenureMilestones } from "@/lib/leaveCalc";
import { getFiscalYear, kstEndOfDay } from "@/lib/workdays";
import { addCalendarMonthsToYmd, addDaysYMD } from "@/lib/dateUtils";
import { birthdayInstancesInFiscalYear } from "@/lib/fiscalYearInitGrants";
import { DUTY_DEPT_CODES, DUTY_DEPT_TO_LABEL } from "@/lib/employeeExcel";
import {
  asOfKstTodayForMonthlyAccrual,
  previewMonthlyPoolSyncNeeded,
  regularBaseAnnualExists,
  syncMonthlyAccrualPoolForFiscalInit,
} from "@/lib/monthlyAccrualPool";
import { findTenureMilestoneAllocation } from "@/lib/tenureAllocationDedupe";
import {
  ensureTenureMilestonesForFiscalYear,
  loadTenureMilestoneConfigs,
} from "@/lib/tenureMilestoneFromDb";
import { formatLeaveDayDisplay } from "@/lib/leaveOverviewTable";

const MONTHLY_POOL_PREVIEW_KEY = "MONTHLY_ACCRUAL_POOL";
/** 미리보기 표: 생일·근속 주년은 열 폭증 방지를 위해 한 열에 합쳐 표시 */
const PREVIEW_COL_BD = "PREVIEW_BIRTHDAY_MERGED";
const PREVIEW_COL_MS = "PREVIEW_TENURE_MS_MERGED";

/**
 * POST /api/admin/fiscal-year/init
 * body: { fy: number, dryRun?: boolean }
 *
 * dryRun: true → DB 변경 없이 추가될 할당 목록만 반환 (미리보기)
 *
 * 귀속연도 일괄 초기화:
 *  1. 기본연차(BASE_ANNUAL) + 근속가산(TENURE_BONUS)
 *  2. AllocationSourceConfig 루프: includeInFiscalInit 이고 LeaveType.validityBasis === 귀속연도 인 소스만 FY 통째 부여
 *  3. 입사 주년 부여: LeaveType.hireAnniversaryYears(및 allocationSourceCode) 메타로 해당 FY 안 기념일이 있으면
 *     스케줄러와 동일 중복 규칙으로 없을 때만 생성(일괄 초기화 보강 + 매일 스케줄러 병행 가능).
 *  4. 생일반차: applyGroupKey=birthday 이고 includeInFiscalInit 인 유형 — FY 안 달력 생일, note 중복 없으면 생성
 *  자동 이월(PENDING) 없음 — 수동 이월만.
 */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const { fy, dryRun } = body;
  if (!fy || isNaN(fy)) return NextResponse.json({ error:"귀속연도(fy) 필요" }, { status:400 });

  const { start: fyStart, end: fyEnd } = fiscalPeriod(fy);
  const employees = await prisma.employee.findMany({
    where: {
      status: { in: ["ACTIVE", "INVITED"] },
      employeeType: { not: "EXTERNAL" },
    },
    include: { team: true },
  });
  const sourceConfigs = await prisma.allocationSourceConfig.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  const leaveTypesBySource = await prisma.leaveType.findMany({
    where: { isActive: true, allocationSourceCode: { not: null } },
    select: {
      allocationSourceCode: true,
      name: true,
      daysPerUnit: true,
      maxPerYear: true,
      validityBasis: true,
      applyGroupKey: true,
      includeInFiscalInit: true,
      validityMonths: true,
    },
  });
  const leaveTypeSourceMap = new Map(
    leaveTypesBySource
      .filter((lt) => !!lt.allocationSourceCode)
      .map((lt) => [String(lt.allocationSourceCode), lt]),
  );

  const DUTY_DEPT_VALUES = DUTY_DEPT_CODES;
  const DUTY_SOURCE = "DUTY_DEPT";
  const DUTY_LABEL = DUTY_DEPT_TO_LABEL;

  // DB에서 규칙 읽기 (AllocationSourceConfig)
  const baseAnnualCfg  = sourceConfigs.find((s) => s.sourceCode === "BASE_ANNUAL");
  const tenureBonusCfg = sourceConfigs.find((s) => s.sourceCode === "TENURE_BONUS");

  const BASE_ANNUAL_DAYS    = Number(baseAnnualCfg?.defaultDays      ?? 15);
  // 입사 후 첫 정규 귀속연도(입사 귀속연도 + 1)에 부여하는 기본연차 일수.
  // 해당 연도에는 TENURE_1Y(3일)가 별도 부여되므로 합산 시 15일에 근접.
  const FIRST_FULL_FY_BASE_DAYS = 12;
  const BONUS_INTERVAL_YRS  = Number(tenureBonusCfg?.bonusIntervalYears ?? 2);
  const BONUS_MAX_DAYS      = Number(tenureBonusCfg?.bonusMaxDays     ?? 10);
  const BONUS_SKIP_FREE     = tenureBonusCfg?.skipForFreelancer        ?? true;

  async function allocExists(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    employeeId: string,
    sourceCode: string,
    fiscalYear: number,
  ) {
    return tx.leaveAllocation.findFirst({
      where: { employeeId, sourceCode, fiscalYear },
    });
  }

  const sourceLabelMap = new Map<string, string>();
  for (const cfg of sourceConfigs) sourceLabelMap.set(cfg.sourceCode, cfg.label);
  for (const lt of leaveTypesBySource) {
    if (lt.allocationSourceCode && !sourceLabelMap.has(lt.allocationSourceCode)) {
      sourceLabelMap.set(lt.allocationSourceCode, lt.name);
    }
  }

  const tenureMilestoneConfigs = await loadTenureMilestoneConfigs(prisma);

  /** dryRun: 미리보기만 반환 (DB 변경 없음) — 열=부여 소스(메타 키), 행=사원 */
  if (dryRun === true) {
    type PreviewItem = { key: string; label: string; totalDays: number };
    type PreviewRow = { employeeId: string; name: string; items: PreviewItem[] };
    const preview: PreviewRow[] = [];

    function sortInitPreviewColumnKeys(keys: string[]): string[] {
      const rank = (key: string): [number, number, string] => {
        if (key === "BASE_ANNUAL") return [0, 0, key];
        if (key === MONTHLY_POOL_PREVIEW_KEY) return [0, 0.45, key];
        if (key === "TENURE_BONUS") return [0, 1, key];
        if (key === PREVIEW_COL_MS) return [2.5, 0, key];
        if (key === PREVIEW_COL_BD) return [2.55, 0, key];
        const cfg = sourceConfigs.find((c) => c.sourceCode === key);
        return [2, cfg?.sortOrder ?? 9999, key];
      };
      return [...keys].sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra[0] !== rb[0]) return ra[0] - rb[0];
        if (ra[1] !== rb[1]) return ra[1] - rb[1];
        return ra[2].localeCompare(rb[2]);
      });
    }

    for (const emp of employees) {
      if (!emp.hireDate) continue;
      const hire = new Date(emp.hireDate);
      const hireFY = getFiscalYear(hire);
      // 입사 귀속연도 이후 귀속연도 수 (1 = 첫 정규 FY, 2 = 두 번째 FY, ...)
      const fullFYsFromHire = fy - hireFY;
      // TENURE_BONUS 계산용 실근속 연수 (실제 날짜 기준)
      const yearsOfService = Math.floor((fyStart.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000));
      const items: PreviewItem[] = [];

      const exists = (empId: string, code: string) =>
        prisma.leaveAllocation.findFirst({ where: { employeeId: empId, sourceCode: code, fiscalYear: fy } });

      if (fullFYsFromHire >= 1) {
        // 첫 정규 귀속연도: 12일, 이후 귀속연도: defaultDays(15일)
        const baseDays = fullFYsFromHire === 1 ? FIRST_FULL_FY_BASE_DAYS : BASE_ANNUAL_DAYS;
        if (!(await regularBaseAnnualExists(prisma, emp.id, fy)))
          items.push({ key: "BASE_ANNUAL", label: "기본연차", totalDays: baseDays });
        const bonus = BONUS_INTERVAL_YRS > 0
          ? Math.min(Math.floor(yearsOfService / BONUS_INTERVAL_YRS), BONUS_MAX_DAYS)
          : 0;
        const empType = (emp as any).employeeType ?? "FULL";
        const skipBonus = BONUS_SKIP_FREE && empType === "FREE";
        if (bonus > 0 && !skipBonus && !(await exists(emp.id, "TENURE_BONUS")))
          items.push({ key: "TENURE_BONUS", label: `근속가산(+${bonus}일)`, totalDays: bonus });
      }
      for (const cfg of sourceConfigs) {
        if (["BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER"].includes(cfg.sourceCode)) continue;
        if (cfg.sourceCode.startsWith("MONTHLY_ACCRUAL_")) continue;
        if (cfg.tenureYears != null) continue;
        const lt = leaveTypeSourceMap.get(cfg.sourceCode);
        if (lt?.includeInFiscalInit === false) continue;
        if (lt?.applyGroupKey === "birthday") continue;
        // 귀속연도 통째 부여는 «귀속연도» 유효기준 휴가만 (부여일·입사일형은 생일·근속 마일스톤 등 별도 분기)
        if (lt && lt.validityBasis !== "귀속연도") continue;
        if (cfg.sourceCode === DUTY_SOURCE) {
          const dutyDept = (emp as { dutyDept?: string | null }).dutyDept ?? null;
          if (!dutyDept || !(DUTY_DEPT_VALUES as readonly string[]).includes(dutyDept)) continue;
        }
        if (await exists(emp.id, cfg.sourceCode)) continue;
        // AllocationSourceConfig.defaultDays 만 사용 — LeaveType.maxPerYear 폴백 시 포상(AWARD) 등이 전원 부여되는 버그 방지
        const days =
          cfg.defaultDays != null && Number(cfg.defaultDays) > 0 ? Number(cfg.defaultDays) : null;
        if (days == null) continue;
        items.push({ key: cfg.sourceCode, label: cfg.label, totalDays: days });
      }

      const bhLt = [...leaveTypeSourceMap.values()].find(
        (lt) => lt.applyGroupKey === "birthday" && lt.includeInFiscalInit !== false,
      );
      const bhSrc = bhLt?.allocationSourceCode;
      if (bhLt && bhSrc && emp.birthDate) {
        for (const { birthdayDateStr } of birthdayInstancesInFiscalYear(fy, new Date(emp.birthDate as Date))) {
          const alreadyBh = await prisma.leaveAllocation.findFirst({
            where: {
              employeeId: emp.id,
              sourceCode: bhSrc,
              note: { contains: birthdayDateStr },
            },
          });
          if (alreadyBh) continue;
          items.push({
            key: `BD:${birthdayDateStr}`,
            label: `${bhLt.name}(${birthdayDateStr})`,
            totalDays: Number(bhLt.daysPerUnit ?? 0.5),
          });
        }
      }

      for (const m of getTenureMilestones(hire, fyStart, fyEnd, tenureMilestoneConfigs)) {
        if (m.days <= 0) continue;
        const dup = await findTenureMilestoneAllocation(prisma, emp.id, m.code, m.anniversaryYmd);
        if (dup) continue;
        items.push({
          key: `MS:${m.code}:${m.anniversaryYmd}`,
          label: `${m.label}(${m.anniversaryYmd})`,
          totalDays: m.days,
        });
      }

      const mp = await previewMonthlyPoolSyncNeeded(prisma, emp.id, hire, fy, new Date());
      if (mp.needed) {
        items.push({
          key: MONTHLY_POOL_PREVIEW_KEY,
          label: "기본연차(월별적립)",
          totalDays: mp.expectedTotalDays,
        });
      }

      if (items.length > 0) preview.push({ employeeId: emp.id, name: emp.name, items });
    }

    const keySet = new Set<string>();
    for (const row of preview) {
      for (const it of row.items) {
        if (it.key.startsWith("BD:")) keySet.add(PREVIEW_COL_BD);
        else if (it.key.startsWith("MS:")) keySet.add(PREVIEW_COL_MS);
        else keySet.add(it.key);
      }
    }
    const columnKeys = sortInitPreviewColumnKeys([...keySet]);

    const bhLtGlobal = [...leaveTypeSourceMap.values()].find(
      (lt) => lt.applyGroupKey === "birthday" && lt.includeInFiscalInit !== false,
    );
    const labelByKey = new Map<string, string>();
    for (const row of preview) {
      for (const it of row.items) {
        if (it.key.startsWith("BD:") || it.key.startsWith("MS:")) continue;
        if (!labelByKey.has(it.key)) labelByKey.set(it.key, it.label);
      }
    }
    labelByKey.set(PREVIEW_COL_BD, bhLtGlobal?.name ?? "생일반차");
    labelByKey.set(PREVIEW_COL_MS, "근속 마일스톤");
    for (const k of columnKeys) {
      if (!labelByKey.has(k)) labelByKey.set(k, k);
    }

    const previewMatrix = {
      columns: columnKeys.map((key) => ({ key, label: labelByKey.get(key) ?? key })),
      rows: preview.map((r) => {
        const values: Record<string, number | string | null> = {};
        for (const k of columnKeys) values[k] = null;
        const bdParts: string[] = [];
        const msParts: string[] = [];
        for (const it of r.items) {
          if (it.key.startsWith("BD:")) {
            const d = it.key.slice(3);
            bdParts.push(`${formatLeaveDayDisplay(it.totalDays)}일(${d})`);
          } else if (it.key.startsWith("MS:")) {
            msParts.push(`${formatLeaveDayDisplay(it.totalDays)}일(${it.label})`);
          } else {
            values[it.key] = it.totalDays;
          }
        }
        if (bdParts.length) values[PREVIEW_COL_BD] = bdParts.join("\n");
        if (msParts.length) values[PREVIEW_COL_MS] = msParts.join("\n");
        return { employeeId: r.employeeId, name: r.name, values };
      }),
    };

    const totalToCreate = preview.reduce((s, p) => s + p.items.length, 0);
    return NextResponse.json({
      ok: true,
      dryRun: true,
      fy,
      previewMatrix,
      totalEmployees: employees.length,
      totalToCreate,
    });
  }

  const results = await prisma.$transaction(async (tx) => {
    const out: { name: string; allocsCreated: number; skipped: number }[] = [];
    for (const emp of employees) {
      if (!emp.hireDate) continue;
      const hire = new Date(emp.hireDate);
      const hireFY = getFiscalYear(hire);
      const fullFYsFromHire = fy - hireFY;
      const yearsOfService = Math.floor((fyStart.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000));
      let created = 0, skipped = 0;

      if (fullFYsFromHire >= 1) {
        // 첫 정규 귀속연도: 12일, 이후: defaultDays(15일)
        const baseDays = fullFYsFromHire === 1 ? FIRST_FULL_FY_BASE_DAYS : BASE_ANNUAL_DAYS;
        const exists = await regularBaseAnnualExists(tx, emp.id, fy);
        if (!exists) {
          await tx.leaveAllocation.create({
            data: {
              employeeId: emp.id, sourceCode: "BASE_ANNUAL", label: "기본연차",
              totalDays: baseDays, usedDays: 0,
              validFrom: fyStart, validUntil: fyEnd, fiscalYear: fy,
            },
          });
          created++;
        } else { skipped++; }

        const bonus = BONUS_INTERVAL_YRS > 0
          ? Math.min(Math.floor(yearsOfService / BONUS_INTERVAL_YRS), BONUS_MAX_DAYS)
          : 0;
        const empType = (emp as any).employeeType ?? "FULL";
        const skipBonus = BONUS_SKIP_FREE && empType === "FREE";
        if (bonus > 0 && !skipBonus) {
          const bonusExists = await allocExists(tx, emp.id, "TENURE_BONUS", fy);
          if (!bonusExists) {
            await tx.leaveAllocation.create({
              data: {
                employeeId: emp.id, sourceCode: "TENURE_BONUS",
                label: `근속가산(+${bonus}일)`,
                totalDays: bonus, usedDays: 0,
                validFrom: fyStart, validUntil: fyEnd, fiscalYear: fy,
              },
            });
            created++;
          } else { skipped++; }
        }
      }

      const monthlySync = await syncMonthlyAccrualPoolForFiscalInit(tx, {
        employeeId: emp.id,
        hireDate: hire,
        fiscalYear: fy,
        asOf: asOfKstTodayForMonthlyAccrual(),
        dryRun: false,
      });
      created += monthlySync.created + monthlySync.updated;

      const bhLtTx = [...leaveTypeSourceMap.values()].find(
        (lt) => lt.applyGroupKey === "birthday" && lt.includeInFiscalInit !== false,
      );
      const bhSrcTx = bhLtTx?.allocationSourceCode;
      if (bhLtTx && bhSrcTx && emp.birthDate) {
        const validityMonths = bhLtTx.validityMonths ?? 3;
        const daysPerUnit = Number(bhLtTx.daysPerUnit ?? 0.5);
        for (const { birthdayThisYear, birthdayDateStr } of birthdayInstancesInFiscalYear(
          fy,
          new Date(emp.birthDate as Date),
        )) {
          const alreadyBh = await tx.leaveAllocation.findFirst({
            where: {
              employeeId: emp.id,
              sourceCode: bhSrcTx,
              note: { contains: birthdayDateStr },
            },
          });
          if (alreadyBh) {
            skipped++;
            continue;
          }
          const periodEndYmd = addDaysYMD(addCalendarMonthsToYmd(birthdayDateStr, validityMonths), -1);
          const [ue, um, ud] = periodEndYmd.split("-").map(Number);
          const validUntilBh = kstEndOfDay(ue, um, ud);
          await tx.leaveAllocation.create({
            data: {
              employeeId: emp.id,
              sourceCode: bhSrcTx,
              label: bhLtTx.name,
              totalDays: daysPerUnit,
              usedDays: 0,
              validFrom: birthdayThisYear,
              validUntil: validUntilBh,
              fiscalYear: null,
              isActive: true,
              note: `생일반차 ${birthdayDateStr} 부여 (부여일 기준 ${validityMonths}개월)`,
            },
          });
          created++;
        }
      }

      created += await ensureTenureMilestonesForFiscalYear(tx, {
        fy,
        employeeId: emp.id,
        hireDate: hire,
        milestoneConfigs: tenureMilestoneConfigs,
      });

      for (const cfg of sourceConfigs) {
        if (["BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER"].includes(cfg.sourceCode)) continue;
        if (cfg.sourceCode.startsWith("MONTHLY_ACCRUAL_")) continue;
        if (cfg.tenureYears != null) continue;
        const lt = leaveTypeSourceMap.get(cfg.sourceCode);
        if (lt?.includeInFiscalInit === false) continue;
        if (lt?.applyGroupKey === "birthday") continue;
        if (lt && lt.validityBasis !== "귀속연도") continue;
        const dutyDept = (emp as { dutyDept?: string | null }).dutyDept ?? null;
        if (cfg.sourceCode === DUTY_SOURCE && (!dutyDept || !(DUTY_DEPT_VALUES as readonly string[]).includes(dutyDept))) continue;
        const exists = await allocExists(tx, emp.id, cfg.sourceCode, fy);
        if (exists) { skipped++; continue; }
        const days =
          cfg.defaultDays != null && Number(cfg.defaultDays) > 0 ? Number(cfg.defaultDays) : null;
        if (days == null) { skipped++; continue; }
        await tx.leaveAllocation.create({
          data: {
            employeeId: emp.id,
            sourceCode: cfg.sourceCode,
            label: cfg.label,
            totalDays: Number(days),
            usedDays: 0,
            validFrom: fyStart,
            validUntil: fyEnd,
            fiscalYear: fy,
            note: cfg.sourceCode === DUTY_SOURCE && dutyDept
              ? `${DUTY_LABEL[dutyDept] ?? dutyDept} 소속 직무부서 휴가 ${Number(days)}일`
              : (cfg.note ?? null),
          },
        });
        created++;
      }

      out.push({ name: emp.name, allocsCreated: created, skipped });
    }
    return out;
  });

  return NextResponse.json({
    ok:true,
    fy,
    total: employees.length,
    results,
    summary:{
      created: results.reduce((s,r)=>s+r.allocsCreated,0),
      skipped: results.reduce((s,r)=>s+r.skipped,0),
    },
  });
}

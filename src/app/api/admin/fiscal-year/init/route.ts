import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { fiscalPeriod } from "@/lib/leaveCalc";
import {
  previewMonthlyPoolSyncNeeded,
  regularBaseAnnualExists,
  syncMonthlyAccrualPoolForFiscalInit,
} from "@/lib/monthlyAccrualPool";

const MONTHLY_POOL_PREVIEW_KEY = "MONTHLY_ACCRUAL_POOL";

/**
 * POST /api/admin/fiscal-year/init
 * body: { fy: number, dryRun?: boolean }
 *
 * dryRun: true → DB 변경 없이 추가될 할당 목록만 반환 (미리보기)
 *
 * 귀속연도 일괄 초기화 (귀속연도 단위로 부여되는 휴가만):
 *  1. 기본연차(BASE_ANNUAL) + 근속가산(TENURE_BONUS)
 *  2. 돌봄(CARE), 연휴연장(HOLIDAY_EXT), 직무부서(DUTY_DEPT)
 *  3. 이미 존재하는 할당은 건드리지 않음 (skip)
 */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM","ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error:"권한 없음" }, { status:403 });

  const body = await req.json().catch(() => ({}));
  const { fy, dryRun } = body;
  if (!fy || isNaN(fy)) return NextResponse.json({ error:"귀속연도(fy) 필요" }, { status:400 });

  const { start: fyStart, end: fyEnd } = fiscalPeriod(fy);
  const prevFy = fy - 1;
  const { start: prevFyStart, end: prevFyEnd } = fiscalPeriod(prevFy);
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
      includeInFiscalInit: true,
      carryoverEligible: true,
      autoCarryoverOnFiscalInit: true,
    },
  });
  const leaveTypeSourceMap = new Map(
    leaveTypesBySource
      .filter((lt) => !!lt.allocationSourceCode)
      .map((lt) => [String(lt.allocationSourceCode), lt]),
  );

  const DUTY_DEPT_VALUES = ["OPERATIONS", "EDUCATION", "WELFARE"];
  const DUTY_SOURCE = "DUTY_DEPT";
  const DUTY_LABEL: Record<string, string> = { OPERATIONS: "운영부", EDUCATION: "교육부", WELFARE: "복지부" };

  // DB에서 규칙 읽기 (AllocationSourceConfig)
  const baseAnnualCfg  = sourceConfigs.find((s) => s.sourceCode === "BASE_ANNUAL");
  const tenureBonusCfg = sourceConfigs.find((s) => s.sourceCode === "TENURE_BONUS");
  const tenure1yCfg    = sourceConfigs.find((s) => s.sourceCode === "TENURE_1Y");

  const BASE_ANNUAL_DAYS    = Number(baseAnnualCfg?.defaultDays      ?? 15);
  const BONUS_INTERVAL_YRS  = Number(tenureBonusCfg?.bonusIntervalYears ?? 2);
  const BONUS_MAX_DAYS      = Number(tenureBonusCfg?.bonusMaxDays     ?? 10);
  const BONUS_SKIP_FREE     = tenureBonusCfg?.skipForFreelancer        ?? true;
  // TENURE_1Y: 귀속연도 마지막 N개월 이내 부여분은 다음 귀속연도로 이월
  // FY 종료월(4월) 기준: cutoffMonth = 5 - N (N=3 → 2월 이상이면 이월 대상)
  const TENURE_1Y_CARRYOVER_MONTHS = Number(tenure1yCfg?.carryoverThresholdMonths ?? 3);
  const TENURE_1Y_CUTOFF_MONTH     = 5 - TENURE_1Y_CARRYOVER_MONTHS; // 귀속연도 종료 N개월 전 시작 월

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

  const TENURE_1Y_CARRYOVER_LABEL = "1년근속휴가(이월)";
  const TENURE_1Y_CARRYOVER_NOTE_KEY = "TENURE_1Y_CARRYOVER_FROM";
  const AUTO_CARRYOVER_NOTE_KEY = "AUTO_CARRYOVER_FROM";

  async function getTenure1yCarryoverDays(
    finder: any,
    employeeId: string,
    targetFy: number,
  ): Promise<number> {
    const already = await finder.leaveAllocation.findFirst({
      where: {
        employeeId,
        sourceCode: "TENURE_1Y",
        fiscalYear: targetFy,
        label: TENURE_1Y_CARRYOVER_LABEL,
      },
      select: { id: true },
    });
    if (already) return 0;

    const prev = await finder.leaveAllocation.findMany({
      where: {
        employeeId,
        sourceCode: "TENURE_1Y",
        validFrom: { gte: prevFyStart, lte: prevFyEnd },
      },
      select: { id: true, totalDays: true, usedDays: true, validFrom: true },
    });

    let days = 0;
    for (const a of prev) {
      const month = new Date(a.validFrom).getMonth() + 1; // 1~12
      // FY 종료월(4월) 기준 마지막 TENURE_1Y_CARRYOVER_MONTHS 개월 이내 부여분만 이월 특례
      // FY가 5월~4월이므로: cutoffMonth = 5 - N, endMonth = 4
      if (month < TENURE_1Y_CUTOFF_MONTH || month > 4) continue;
      const remaining = Number(a.totalDays) - Number(a.usedDays);
      if (remaining > 0) days += remaining;
    }
    return days;
  }
  const autoCarryoverSourceCodes = [
    ...new Set(
      leaveTypesBySource
        .filter(
          (lt) =>
            !!lt.allocationSourceCode &&
            lt.carryoverEligible === true &&
            lt.autoCarryoverOnFiscalInit === true,
        )
        .map((lt) => String(lt.allocationSourceCode)),
    ),
  ];
  const sourceLabelMap = new Map<string, string>();
  for (const cfg of sourceConfigs) sourceLabelMap.set(cfg.sourceCode, cfg.label);
  for (const lt of leaveTypesBySource) {
    if (lt.allocationSourceCode && !sourceLabelMap.has(lt.allocationSourceCode)) {
      sourceLabelMap.set(lt.allocationSourceCode, lt.name);
    }
  }

  /**
   * 자동이월 대상 원본 행 조회.
   * - fiscalYear != targetFy (이미 이월된 행 제외)
   * - validUntil >= fyStart (새 귀속연도 시작일 이후까지 유효한 행만)
   * - isActive = true
   * - remaining > 0
   * - 이미 targetFy로 이월된 행이 있으면 빈 배열 반환
   */
  async function getAutoCarryoverSourceRows(
    finder: any,
    employeeId: string,
    targetFy: number,
    sourceCode: string,
  ): Promise<{ id: string; totalDays: number; usedDays: number; validFrom: Date; validUntil: Date }[]> {
    const already = await finder.leaveAllocation.findFirst({
      where: {
        employeeId,
        sourceCode,
        fiscalYear: targetFy,
        note: { contains: AUTO_CARRYOVER_NOTE_KEY },
      },
      select: { id: true },
    });
    if (already) return [];

    const rows = await finder.leaveAllocation.findMany({
      where: {
        employeeId,
        sourceCode,
        isActive: true,
        fiscalYear: { not: targetFy },
        validUntil: { gte: fyStart },
      },
      select: { id: true, totalDays: true, usedDays: true, validFrom: true, validUntil: true },
    });
    return rows.filter(
      (r: { totalDays: number; usedDays: number }) => Number(r.totalDays) - Number(r.usedDays) > 0,
    );
  }

  /** 이월 일수만 빠르게 계산 (dryRun 미리보기용) */
  async function getAutoCarryoverDaysBySource(
    finder: any,
    employeeId: string,
    targetFy: number,
    sourceCode: string,
  ): Promise<number> {
    const rows = await getAutoCarryoverSourceRows(finder, employeeId, targetFy, sourceCode);
    return rows.reduce((s, r) => s + Math.max(0, Number(r.totalDays) - Number(r.usedDays)), 0);
  }

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
        if (key === "TENURE_1Y_CARRY") return [3, 0, key];
        if (key.startsWith("AUTO:")) {
          const src = key.slice(5);
          const ord = sourceConfigs.find((c) => c.sourceCode === src)?.sortOrder ?? 500;
          return [4, ord, key];
        }
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
      const yearsOfService = Math.floor((fyStart.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000));
      const items: PreviewItem[] = [];

      const exists = (empId: string, code: string) =>
        prisma.leaveAllocation.findFirst({ where: { employeeId: empId, sourceCode: code, fiscalYear: fy } });

      if (yearsOfService >= 1) {
        if (!(await regularBaseAnnualExists(prisma, emp.id, fy)))
          items.push({ key: "BASE_ANNUAL", label: "기본연차", totalDays: BASE_ANNUAL_DAYS });
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
        if (lt && lt.validityBasis !== "귀속연도") continue;
        if (lt && lt.includeInFiscalInit === false) continue;
        if (cfg.sourceCode === DUTY_SOURCE) {
          const dutyDept = (emp as { dutyDept?: string | null }).dutyDept ?? null;
          if (!dutyDept || !DUTY_DEPT_VALUES.includes(dutyDept)) continue;
        }
        if (await exists(emp.id, cfg.sourceCode)) continue;
        const days = cfg.defaultDays ?? lt?.maxPerYear ?? lt?.daysPerUnit ?? null;
        if (!days || Number(days) <= 0) continue;
        items.push({ key: cfg.sourceCode, label: cfg.label, totalDays: Number(days) });
      }
      const tenure1yCarry = await getTenure1yCarryoverDays(prisma, emp.id, fy);
      if (tenure1yCarry > 0) {
        items.push({ key: "TENURE_1Y_CARRY", label: "1년근속휴가(이월)", totalDays: tenure1yCarry });
      }
      for (const src of autoCarryoverSourceCodes) {
        const days = await getAutoCarryoverDaysBySource(prisma, emp.id, fy, src);
        if (days > 0) {
          items.push({
            key: `AUTO:${src}`,
            label: `${sourceLabelMap.get(src) ?? src}(자동이월)`,
            totalDays: Number(days.toFixed(1)),
          });
        }
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
    for (const row of preview) for (const it of row.items) keySet.add(it.key);
    const columnKeys = sortInitPreviewColumnKeys([...keySet]);
    const labelByKey = new Map<string, string>();
    for (const row of preview) for (const it of row.items) {
      if (!labelByKey.has(it.key)) labelByKey.set(it.key, it.label);
    }
    for (const k of columnKeys) {
      if (!labelByKey.has(k)) labelByKey.set(k, k);
    }

    const previewMatrix = {
      columns: columnKeys.map((key) => ({ key, label: labelByKey.get(key) ?? key })),
      rows: preview.map((r) => {
        const values: Record<string, number | null> = {};
        for (const k of columnKeys) values[k] = null;
        for (const it of r.items) values[it.key] = it.totalDays;
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
      const yearsOfService = Math.floor((fyStart.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000));
      let created = 0, skipped = 0;

      if (yearsOfService >= 1) {
        const exists = await regularBaseAnnualExists(tx, emp.id, fy);
        if (!exists) {
          await tx.leaveAllocation.create({
            data: {
              employeeId: emp.id, sourceCode: "BASE_ANNUAL", label: "기본연차",
              totalDays: BASE_ANNUAL_DAYS, usedDays: 0,
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
        asOf: new Date(),
        dryRun: false,
      });
      created += monthlySync.created + monthlySync.updated;

      for (const cfg of sourceConfigs) {
        if (["BASE_ANNUAL", "TENURE_BONUS", "CARRYOVER"].includes(cfg.sourceCode)) continue;
        if (cfg.sourceCode.startsWith("MONTHLY_ACCRUAL_")) continue;
        // tenureYears가 있는 sourceCode(근속특별휴가)는 스케줄러가 부여하므로 귀속연도 초기화에서 제외
        if (cfg.tenureYears != null) continue;
        const lt = leaveTypeSourceMap.get(cfg.sourceCode);
        if (lt && lt.validityBasis !== "귀속연도") continue;
        if (lt && lt.includeInFiscalInit === false) continue;
        const dutyDept = (emp as { dutyDept?: string | null }).dutyDept ?? null;
        if (cfg.sourceCode === DUTY_SOURCE && (!dutyDept || !DUTY_DEPT_VALUES.includes(dutyDept))) continue;
        const exists = await allocExists(tx, emp.id, cfg.sourceCode, fy);
        if (exists) { skipped++; continue; }
        const days = cfg.defaultDays ?? lt?.maxPerYear ?? lt?.daysPerUnit ?? null;
        if (!days || Number(days) <= 0) { skipped++; continue; }
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

      const tenure1yCarry = await getTenure1yCarryoverDays(tx, emp.id, fy);
      if (tenure1yCarry > 0) {
        await tx.leaveAllocation.create({
          data: {
            employeeId: emp.id,
            sourceCode: "TENURE_1Y",
            label: TENURE_1Y_CARRYOVER_LABEL,
            totalDays: tenure1yCarry,
            usedDays: 0,
            validFrom: fyStart,
            validUntil: fyEnd,
            fiscalYear: fy,
            note: `${TENURE_1Y_CARRYOVER_NOTE_KEY}:${prevFy} (마지막 ${TENURE_1Y_CARRYOVER_MONTHS}개월 부여분 잔여 이월)`,
          },
        });
        created++;
      }
      for (const src of autoCarryoverSourceCodes) {
        const srcRows = await getAutoCarryoverSourceRows(tx, emp.id, fy, src);
        if (srcRows.length === 0) continue;

        const srcLabel = sourceLabelMap.get(src) ?? src;
        // 원본 행 1개당 이월 행 1개 생성 (포상휴가 등 복수 부여 케이스 대응)
        for (const row of srcRows) {
          const remaining = Number(row.totalDays) - Number(row.usedDays);
          if (remaining <= 0) continue;
          await tx.leaveAllocation.create({
            data: {
              employeeId: emp.id,
              sourceCode: src,
              label: `${srcLabel}(이월)`,
              totalDays: Number(remaining.toFixed(1)),
              usedDays: 0,
              validFrom: new Date(row.validFrom),
              validUntil: new Date(row.validUntil),
              fiscalYear: fy,
              note: `${AUTO_CARRYOVER_NOTE_KEY}:${fy}:${src} (원본 ${row.id})`,
            },
          });
          // 원본 비활성화 (중복 차감 방지, 이력은 보존)
          await tx.leaveAllocation.update({
            where: { id: row.id },
            data: { isActive: false },
          });
          created++;
        }
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

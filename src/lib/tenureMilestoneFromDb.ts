import type { DB, DBTx } from "@/lib/db";
import {
  fiscalPeriod,
  formatTenureMilestoneAutoNote,
  getTenureMilestones,
  type TenureMilestoneConfig,
} from "@/lib/leaveCalc";
import { tenureMilestoneValidUntil, todayStr } from "@/lib/workdays";
import { findTenureMilestoneAllocation } from "@/lib/tenureAllocationDedupe";

/**
 * 입사 주년 부여 규칙(일수·코드·주년):
 * 1) 우선 `LeaveType`: `hireAnniversaryYears` + `allocationSourceCode` + `daysPerUnit`(또는 `maxPerYear`)
 * 2) 없으면 `AllocationSourceConfig`: `tenureYears` + `defaultDays`
 * 3) 둘 다 없을 때만 `leaveCalc.DEFAULT_TENURE_MILESTONES` 폴백(테스트용)
 */
export async function loadTenureMilestoneConfigs(db: DB): Promise<TenureMilestoneConfig[]> {
  const fromLt = await db.leaveType.findMany({
    where: {
      isActive: true,
      hireAnniversaryYears: { not: null },
      allocationSourceCode: { not: null },
    },
    orderBy: [{ hireAnniversaryYears: "asc" }, { sortOrder: "asc" }],
    select: {
      allocationSourceCode: true,
      name: true,
      daysPerUnit: true,
      hireAnniversaryYears: true,
      maxPerYear: true,
    },
  });
  const mapped = fromLt
    .map((r) => {
      const days = Number(r.daysPerUnit ?? r.maxPerYear ?? 0);
      if (days <= 0) return null;
      return {
        years: r.hireAnniversaryYears!,
        code: r.allocationSourceCode!,
        label: r.name,
        days,
      };
    })
    .filter(Boolean) as TenureMilestoneConfig[];
  if (mapped.length > 0) return mapped;

  const cfgs = await db.allocationSourceConfig.findMany({
    where: { isActive: true, tenureYears: { not: null } },
    orderBy: [{ tenureYears: "asc" }, { sortOrder: "asc" }],
  });
  return cfgs
    .map((c) => ({
      years: c.tenureYears!,
      code: c.sourceCode,
      label: c.label,
      days: Number(c.defaultDays ?? 0),
    }))
    .filter((m) => m.days > 0);
}

/**
 * 귀속연도 구간 안에서 아직 없는 입사 주년 부여만 DB에 생성 (스케줄러와 동일 중복 규칙).
 * `asOfYmd`(기본 KST 오늘) **이전 또는 당일**인 기념일만 만든다 — 미래 기념일은 일할 스케줄러에 맡기고,
 * 지나간 날짜에 스케줄러가 못 돌린 분만 귀속 초기화로 보강한다.
 */
export async function ensureTenureMilestonesForFiscalYear(
  tx: DBTx,
  params: {
    fy: number;
    employeeId: string;
    hireDate: Date;
    milestoneConfigs: TenureMilestoneConfig[];
    /** KST YYYY-MM-DD — 이 날짜까지 도래한 기념일만 생성 */
    asOfYmd?: string;
  },
): Promise<number> {
  const { fy, employeeId, hireDate, milestoneConfigs, asOfYmd } = params;
  const asOf = (asOfYmd ?? todayStr()).slice(0, 10);
  if (milestoneConfigs.length === 0) return 0;
  const { start: fyStart, end: fyEnd } = fiscalPeriod(fy);
  let created = 0;
  for (const m of getTenureMilestones(hireDate, fyStart, fyEnd, milestoneConfigs)) {
    if (m.anniversaryYmd > asOf) continue;
    if (m.days <= 0) continue;
    const dup = await findTenureMilestoneAllocation(tx, employeeId, m.code, m.anniversaryYmd);
    if (dup) continue;
    const validUntil = tenureMilestoneValidUntil(m.grantDate, m.years);
    await tx.leaveAllocation.create({
      data: {
        employeeId,
        fiscalYear: null,
        sourceCode: m.code,
        label: m.label,
        totalDays: m.days,
        usedDays: 0,
        validFrom: m.grantDate,
        validUntil,
        isActive: true,
        note: formatTenureMilestoneAutoNote(m.anniversaryYmd, m.years),
      },
    });
    created++;
  }
  return created;
}

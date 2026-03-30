import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { fiscalPeriod } from "@/lib/leaveCalc";

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

  const DUTY_DEPT_VALUES = ["OPERATIONS", "EDUCATION", "WELFARE"];
  const DUTY_DEPT_DAYS = 2;
  const DUTY_SOURCE = "DUTY_DEPT";
  const DUTY_LABEL: Record<string, string> = { OPERATIONS: "운영부", EDUCATION: "교육부", WELFARE: "복지부" };

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

  const BASE_ANNUAL_DAYS = 15;
  const TENURE_1Y_CARRYOVER_LABEL = "1년근속휴가(이월)";
  const TENURE_1Y_CARRYOVER_NOTE_KEY = "TENURE_1Y_CARRYOVER_FROM";

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
      if (month < 2 || month > 4) continue; // FY 마지막 3개월(2~4월) 부여분만 특례
      const remaining = Number(a.totalDays) - Number(a.usedDays);
      if (remaining > 0) days += remaining;
    }
    return days;
  }

  /** dryRun: 미리보기만 반환 (DB 변경 없음) */
  if (dryRun === true) {
    const preview: { name: string; items: { label: string; totalDays: number }[] }[] = [];
    for (const emp of employees) {
      if (!emp.hireDate) continue;
      const hire = new Date(emp.hireDate);
      const yearsOfService = Math.floor((fyStart.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000));
      const items: { label: string; totalDays: number }[] = [];

      const exists = (empId: string, code: string) =>
        prisma.leaveAllocation.findFirst({ where: { employeeId: empId, sourceCode: code, fiscalYear: fy } });

      if (yearsOfService >= 1) {
        if (!(await exists(emp.id, "BASE_ANNUAL")))
          items.push({ label: "기본연차", totalDays: BASE_ANNUAL_DAYS });
        const bonus = Math.min(Math.floor(yearsOfService / 2), 10);
        // 프리랜서(employeeType=FREE)는 2년 가산(TENURE_BONUS) 제외
        const empType = (emp as any).employeeType ?? "FULL";
        if (bonus > 0 && empType !== "FREE" && !(await exists(emp.id, "TENURE_BONUS")))
          items.push({ label: `근속가산(+${bonus}일)`, totalDays: bonus });
      } else {
        const months = Math.floor((fyEnd.getTime() - hire.getTime()) / (30 * 24 * 3600 * 1000));
        if (months > 0 && !(await exists(emp.id, "BASE_ANNUAL")))
          items.push({ label: `기본연차(월발생 ${Math.min(months, 12)}일)`, totalDays: Math.min(months, 12) });
      }
      if (!(await exists(emp.id, "CARE"))) items.push({ label: "돌봄휴가", totalDays: 2 });
      const dutyDept = (emp as { dutyDept?: string | null }).dutyDept ?? null;
      if (dutyDept && DUTY_DEPT_VALUES.includes(dutyDept) && !(await exists(emp.id, DUTY_SOURCE)))
        items.push({ label: "직무부서휴가", totalDays: DUTY_DEPT_DAYS });
      if (!(await exists(emp.id, "HOLIDAY_EXT"))) items.push({ label: "연휴연장휴가", totalDays: 1 });
      const tenure1yCarry = await getTenure1yCarryoverDays(prisma, emp.id, fy);
      if (tenure1yCarry > 0) {
        items.push({ label: "1년근속휴가(이월)", totalDays: tenure1yCarry });
      }

      if (items.length > 0) preview.push({ name: emp.name, items });
    }
    return NextResponse.json({
      ok: true,
      dryRun: true,
      fy,
      preview,
      totalEmployees: employees.length,
      totalToCreate: preview.reduce((s, p) => s + p.items.length, 0),
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
        const exists = await allocExists(tx, emp.id, "BASE_ANNUAL", fy);
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

        const bonus = Math.min(Math.floor(yearsOfService / 2), 10);
        // 프리랜서(employeeType=FREE)는 2년 가산(TENURE_BONUS) 제외
        const empType = (emp as any).employeeType ?? "FULL";
        if (bonus > 0 && empType !== "FREE") {
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
      } else {
        const months = Math.floor((fyEnd.getTime() - hire.getTime()) / (30 * 24 * 3600 * 1000));
        if (months > 0) {
          const monthly = Math.min(months, 12);
          const exists = await allocExists(tx, emp.id, "BASE_ANNUAL", fy);
          if (!exists) {
            await tx.leaveAllocation.create({
              data: {
                employeeId: emp.id, sourceCode: "BASE_ANNUAL",
                label: `기본연차(월발생 ${monthly}일)`,
                totalDays: monthly, usedDays: 0,
                validFrom: hire, validUntil: fyEnd, fiscalYear: fy,
              },
            });
            created++;
          } else { skipped++; }
        }
      }

      const CARE_DAYS = 2;
      const careExists = await allocExists(tx, emp.id, "CARE", fy);
      if (!careExists) {
        await tx.leaveAllocation.create({
          data: {
            employeeId: emp.id,
            sourceCode: "CARE",
            label: "돌봄휴가",
            totalDays: CARE_DAYS,
            usedDays: 0,
            validFrom: fyStart,
            validUntil: fyEnd,
            fiscalYear: fy,
            note: "연 2일 한도, 사용 시 이 할당에서 차감",
          },
        });
        created++;
      } else { skipped++; }

      const dutyDept = (emp as { dutyDept?: string | null }).dutyDept ?? null;
      if (dutyDept && DUTY_DEPT_VALUES.includes(dutyDept)) {
        const dutyExists = await allocExists(tx, emp.id, DUTY_SOURCE, fy);
        if (!dutyExists) {
          await tx.leaveAllocation.create({
            data: {
              employeeId: emp.id,
              sourceCode: DUTY_SOURCE,
              label: "직무부서휴가",
              totalDays: DUTY_DEPT_DAYS,
              usedDays: 0,
              validFrom: fyStart,
              validUntil: fyEnd,
              fiscalYear: fy,
              note: `${DUTY_LABEL[dutyDept] ?? dutyDept} 소속 직무부서 휴가 ${DUTY_DEPT_DAYS}일`,
            },
          });
          created++;
        } else { skipped++; }
      }

      const HOLIDAY_EXT_DAYS = 1;
      const HOLIDAY_EXT_SOURCE = "HOLIDAY_EXT";
      const holidayExtExists = await allocExists(tx, emp.id, HOLIDAY_EXT_SOURCE, fy);
      if (!holidayExtExists) {
        await tx.leaveAllocation.create({
          data: {
            employeeId: emp.id,
            sourceCode: HOLIDAY_EXT_SOURCE,
            label: "연휴연장휴가",
            totalDays: HOLIDAY_EXT_DAYS,
            usedDays: 0,
            validFrom: fyStart,
            validUntil: fyEnd,
            fiscalYear: fy,
            note: "연휴(공휴일 1일 이상 포함) 3일 이상일 때 앞뒤 연속일 사용 가능",
          },
        });
        created++;
      } else { skipped++; }

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
            note: `${TENURE_1Y_CARRYOVER_NOTE_KEY}:${prevFy} (2~4월 부여분 잔여 이월)`,
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

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { fiscalPeriod } from "@/lib/leaveCalc";

/**
 * POST /api/admin/fiscal-year/init
 * body: { fy: number }  e.g. { fy: 2025 }
 *
 * 귀속연도 일괄 초기화 (귀속연도 단위로 부여되는 휴가만):
 *  1. 기본연차(BASE_ANNUAL) + 근속가산(TENURE_BONUS)
 *  2. 돌봄(CARE), 연휴연장(HOLIDAY_EXT), 직무부서(DUTY_DEPT)
 *  3. 이미 존재하는 할당은 건드리지 않음 (skip)
 *
 * ※ 1/5/10년 근속휴가(TENURE_1Y, TENURE_5Y, TENURE_10Y)는 입사일 기준이라 귀속연도와 무관.
 *    스케줄러(근속 기념일 체크)로만 부여합니다.
 */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM","ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error:"권한 없음" }, { status:403 });

  const { fy } = await req.json();
  if (!fy || isNaN(fy)) return NextResponse.json({ error:"귀속연도(fy) 필요" }, { status:400 });

  const { start: fyStart, end: fyEnd } = fiscalPeriod(fy);
  const employees = await prisma.employee.findMany({
    where: { status:{ in:["ACTIVE","INVITED"] } },
    include: { team: true },
  });

  /** 직급부서(사원관리 dutyDept)가 운영부·교육부·복지부일 때 2일 부여. 팀명이 아닌 직급부서 필드 기준 */
  const DUTY_DEPT_VALUES = ["OPERATIONS", "EDUCATION", "WELFARE"];
  const DUTY_DEPT_DAYS = 2;
  const DUTY_SOURCE = "DUTY_DEPT";
  const DUTY_LABEL: Record<string, string> = { OPERATIONS: "운영부", EDUCATION: "교육부", WELFARE: "복지부" };

  /** 이미 해당 employee+sourceCode+fiscalYear 조합이 있으면 생성하지 않음 (중복 방지, isActive 무관) */
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

  /** 기본연차 15일(1년 이상), 근속가산은 별도 TENURE_BONUS로 부여 */
  const BASE_ANNUAL_DAYS = 15;

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
        if (bonus > 0) {
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

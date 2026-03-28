/**
 * 휴가 규정·결재 프로세스·데이터 정합성 자체 검증 스크립트
 * 실행: npx ts-node --transpile-only scripts/verify-leave-policy.ts
 * 또는: npx tsx scripts/verify-leave-policy.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FISCAL_START_MONTH = 5; // 5월 1일
const FISCAL_END_MONTH = 4;   // 다음해 4월 30일

function getFiscalYear(d: Date): number {
  return d.getMonth() + 1 >= FISCAL_START_MONTH ? d.getFullYear() : d.getFullYear() - 1;
}

type AssertResult = { ok: boolean; message: string };

async function runChecks(): Promise<AssertResult[]> {
  const results: AssertResult[] = [];
  const ok = (msg: string) => results.push({ ok: true, message: msg });
  const fail = (msg: string) => results.push({ ok: false, message: msg });

  // ── 1. 귀속연도 로직 (5월~다음해 4월) ─────────────────────
  const may1 = new Date(2025, 4, 1);   // 2025-05-01
  const apr30 = new Date(2026, 3, 30); // 2026-04-30
  if (getFiscalYear(may1) === 2025 && getFiscalYear(apr30) === 2025) {
    ok("귀속연도: 5/1~익년 4/30 → 2025년도");
  } else {
    fail(`귀속연도 계산 오류: 5/1=${getFiscalYear(may1)}, 4/30=${getFiscalYear(apr30)}`);
  }

  const apr29 = new Date(2025, 3, 29);
  if (getFiscalYear(apr29) === 2024) ok("귀속연도: 4/29 → 2024년도");
  else fail(`귀속연도: 4/29 기대 2024, 실제 ${getFiscalYear(apr29)}`);

  // ── 2. 휴가 유형 규정 매칭 ─────────────────────────────
  const leaveTypes = await prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });

  const annual = leaveTypes.find((t) => t.code === "ANNUAL");
  if (annual?.deductFromBalance === true && annual.approvalSteps === 1) {
    ok("연차: 연차 차감, 1단계 결재(팀장)");
  } else {
    fail(`연차 유형: deduct=${annual?.deductFromBalance}, steps=${annual?.approvalSteps}`);
  }

  const sick = leaveTypes.find((t) => t.code === "SICK");
  if (sick?.deductFromBalance === false) {
    ok("병가: 미차감(급여만 영향)");
  } else {
    fail(`병가: deductFromBalance 기대 false, 실제 ${sick?.deductFromBalance}`);
  }

  const care = leaveTypes.find((t) => t.code === "CARE");
  if (care?.deductFromBalance === false && care.maxPerYear === 2) {
    ok("돌봄휴가: 미차감, 연 2일");
  } else {
    fail(`돌봄: deduct=${care?.deductFromBalance}, maxPerYear=${care?.maxPerYear}`);
  }

  const holidayExt = leaveTypes.find((t) => t.code === "HOLIDAY_EXT");
  if (holidayExt?.deductFromBalance === false) {
    ok("연휴연장휴가(종일 유형): 미차감, 전용 풀 1일");
  } else {
    fail(`연휴연장: deduct=${holidayExt?.deductFromBalance}`);
  }

  const pmHalfMonth = leaveTypes.find((t) => t.code === "PM_HALF_MONTH");
  if (pmHalfMonth?.approvalSteps === 1 && pmHalfMonth.maxPerMonth === 1) {
    ok("하프데이: 팀장 1단계, 월 1회");
  } else {
    fail(`하프데이: steps=${pmHalfMonth?.approvalSteps}, maxPerMonth=${pmHalfMonth?.maxPerMonth}`);
  }

  const tenure1y = leaveTypes.find((t) => t.code === "TENURE_1Y");
  if (tenure1y?.approvalSteps === 1) {
    ok("근속휴가(1년): 팀장에서 끝(1단계)");
  } else {
    fail(`1년근속: approvalSteps 기대 1, 실제 ${tenure1y?.approvalSteps}`);
  }

  // ── 3. 할당 usedDays 정합성 ─────────────────────────────
  const allocations = await prisma.leaveAllocation.findMany({ where: { isActive: true } });
  let usedDaysMismatch = false;
  for (const alloc of allocations) {
    const usedFromItems = await prisma.leaveRequestItem.aggregate({
      where: {
        allocationId: alloc.id,
        leaveRequest: { status: { in: ["APPROVED", "CANCEL_REQUESTED"] } },
      },
      _sum: { days: true },
    });
    const expectedUsed = usedFromItems._sum.days ?? 0;
    const diff = Math.abs((alloc.usedDays ?? 0) - expectedUsed);
    if (diff > 0.001) {
      usedDaysMismatch = true;
      fail(`할당 ${alloc.id} (${alloc.sourceCode}): usedDays=${alloc.usedDays}, 실제 승인합=${expectedUsed}`);
    }
  }
  if (!usedDaysMismatch) ok(`할당 usedDays 정합성: ${allocations.length}건 일치`);

  // ── 4. 결재 단계 정합성 (승인된 건은 totalSteps/currentStep 일치) ─────────────────
  const approvedRequests = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED" },
    include: { approvals: { orderBy: { step: "asc" } } },
  });
  for (const req of approvedRequests) {
    if (req.totalSteps > 0 && req.approvals.filter((a) => a.status === "APPROVED").length < req.totalSteps) {
      fail(`휴가신청 ${req.id}: totalSteps=${req.totalSteps}, 승인된 결재=${req.approvals.filter((a) => a.status === "APPROVED").length}`);
    }
  }
  ok(`승인된 휴가 결재 단계 일치: ${approvedRequests.length}건`);

  // ── 5. 동일 사원·동일 sourceCode·동일 귀속연도 할당 1개 (근속 마일스톤은 fiscalYear null 허용) ─────────────────
  const byEmpSourceFy = new Map<string, number>();
  for (const a of allocations) {
    const key = `${a.employeeId}:${a.sourceCode}:${a.fiscalYear ?? "null"}`;
    byEmpSourceFy.set(key, (byEmpSourceFy.get(key) ?? 0) + 1);
  }
  const dupes = [...byEmpSourceFy.entries()].filter(([, c]) => c > 1);
  if (dupes.length > 0) {
    dupes.forEach(([k]) => fail(`할당 중복: ${k}`));
  } else {
    ok("사원·sourceCode·귀속연도별 할당 1개씩");
  }

  // ── 6. 2025 귀속 돌봄·연휴연장 할당 존재 ─────────────────
  const fy2025 = 2025;
  const employees = await prisma.employee.findMany({ where: { status: "ACTIVE" } });
  for (const emp of employees) {
    const care = await prisma.leaveAllocation.findFirst({
      where: { employeeId: emp.id, sourceCode: "CARE", fiscalYear: fy2025 },
    });
    const ext = await prisma.leaveAllocation.findFirst({
      where: { employeeId: emp.id, sourceCode: "HOLIDAY_EXT", fiscalYear: fy2025 },
    });
    if (!care) fail(`사원 ${emp.name}(${emp.empNo}): 2025 돌봄휴가 할당 없음`);
    if (!ext) fail(`사원 ${emp.name}(${emp.empNo}): 2025 연휴연장휴가 할당 없음`);
  }
  ok(`2025 귀속 돌봄/연휴연장 할당: ACTIVE 사원 ${employees.length}명 검사`);

  return results;
}

async function main() {
  console.log("🔍 휴가 규정·결재 프로세스·데이터 정합성 검증\n");
  const results = await runChecks();
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  results.forEach((r) => {
    console.log(r.ok ? `  ✅ ${r.message}` : `  ❌ ${r.message}`);
  });

  console.log("\n---");
  if (failed.length === 0) {
    console.log(`✅ 전체 ${passed}개 검증 통과`);
    process.exit(0);
  } else {
    console.log(`❌ 실패: ${failed.length}건`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

/**
 * 데이터 정합성 검증 스크립트
 * 실행: npx tsx scripts/verify-data-integrity.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Result = { ok: boolean; message: string };

async function run(): Promise<Result[]> {
  const out: Result[] = [];
  const ok = (m: string) => out.push({ ok: true, message: m });
  const fail = (m: string) => out.push({ ok: false, message: m });

  try {
    await prisma.$queryRaw`SELECT 1`;
    ok("DB 연결 성공");
  } catch (e) {
    fail("DB 연결 실패: " + (e as Error).message);
    return out;
  }

  const userCount = await prisma.user.count();
  if (userCount === 0) fail("User 테이블 비어 있음");
  else ok("User " + userCount + "건");

  const empCount = await prisma.employee.count();
  if (empCount === 0) fail("Employee 테이블 비어 있음");
  else ok("Employee " + empCount + "건");

  const ltCount = await prisma.leaveType.count({ where: { isActive: true } });
  if (ltCount === 0) fail("활성 휴가 유형 없음");
  else ok("LeaveType(활성) " + ltCount + "건");

  const allocations = await prisma.leaveAllocation.findMany({ where: { isActive: true } });
  let usedMismatch = 0;
  for (const a of allocations) {
    const sum = await prisma.leaveRequestItem.aggregate({
      where: {
        allocationId: a.id,
        leaveRequest: { status: { in: ["APPROVED", "CANCEL_REQUESTED"] } },
      },
      _sum: { days: true },
    });
    const expected = sum._sum.days ?? 0;
    if (Math.abs((a.usedDays ?? 0) - expected) > 0.001) usedMismatch++;
  }
  if (usedMismatch > 0) fail("할당 usedDays 불일치 " + usedMismatch + "건");
  else ok("할당 usedDays 정합성 " + allocations.length + "건");

  const approved = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED" },
    include: { approvals: true },
  });
  let stepMismatch = 0;
  for (const r of approved) {
    const n = r.approvals.filter((a) => a.status === "APPROVED").length;
    if (r.totalSteps > 0 && n < r.totalSteps) stepMismatch++;
  }
  if (stepMismatch > 0) fail("승인 휴가 결재 단계 불일치 " + stepMismatch + "건");
  else ok("승인 휴가 결재 단계 일치 " + approved.length + "건");

  return out;
}

async function main() {
  console.log("데이터 정합성 검증\n");
  const results = await run();
  const failed = results.filter((r) => !r.ok);
  results.forEach((r) => console.log(r.ok ? "  OK " + r.message : "  FAIL " + r.message));
  console.log("");
  if (failed.length === 0) {
    console.log("전체 검증 통과");
    process.exit(0);
  }
  console.log("실패: " + failed.length + "건");
  process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

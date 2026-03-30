/**
 * 테스트 단계용: 휴가/스탬프/할당 데이터를 초기화하고 샘플 데이터를 다시 채움.
 *
 * 안전장치:
 * - CONFIRM_WIPE=RESET_LEAVE 가 아니면 아무 것도 하지 않음
 * - SystemConfig에 완료 플래그가 있으면 2회 실행 방지 (멱등)
 *
 * 유지(삭제 안 함):
 * - Employee, User, Team 등 사원/계정/조직 마스터
 * - Notice, Form 등 기타 마스터/콘텐츠
 *
 * 삭제:
 * - LeaveRequest/LeaveRequestItem/LeaveApproval/LeaveHistory
 * - LeaveAllocation
 * - StampCard/StampCoupon/StampRequest
 *
 * 재생성:
 * - prisma/seed.ts (샘플 할당+샘플 신청내역+스탬프 포함, 이미 존재하는 마스터는 유지)
 *
 * 실행 예:
 *   CONFIRM_WIPE=RESET_LEAVE npx tsx scripts/reset-leave-test-data.ts
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

const prisma = new PrismaClient();

const CONFIRM_VALUE = "RESET_LEAVE";
const DONE_KEY = "resetLeaveTestDataDoneAt";
const FORCE_ENV = "FORCE_RESET_LEAVE_TEST_DATA";

function nowIso() {
  return new Date().toISOString();
}

async function main() {
  const confirm = (process.env.CONFIRM_WIPE ?? "").trim();
  if (confirm !== CONFIRM_VALUE) {
    console.log(`[reset-leave-test-data] skip: CONFIRM_WIPE=${confirm || "(empty)"} (expected ${CONFIRM_VALUE})`);
    return;
  }

  const force = (process.env[FORCE_ENV] ?? "").trim() === "1";
  const done = await prisma.systemConfig.findUnique({ where: { key: DONE_KEY } });
  if (!force && done?.value) {
    console.log(`[reset-leave-test-data] skip: already done at ${done.value}`);
    return;
  }

  console.log("[reset-leave-test-data] START");
  if (force) console.log(`[reset-leave-test-data] force: ${FORCE_ENV}=1 (ignore done flag)`);

  const before = {
    leaveRequestItems: await prisma.leaveRequestItem.count(),
    leaveApprovals: await prisma.leaveApproval.count(),
    leaveHistories: await prisma.leaveHistory.count(),
    leaveRequests: await prisma.leaveRequest.count(),
    leaveAllocations: await prisma.leaveAllocation.count(),
    stampRequests: await prisma.stampRequest.count(),
    stampCoupons: await prisma.stampCoupon.count(),
    stampCards: await prisma.stampCard.count(),
    users: await prisma.user.count(),
    employees: await prisma.employee.count(),
  };
  console.log("[reset-leave-test-data] preview counts(before):", before);

  await prisma.$transaction(async (tx) => {
    // 휴가
    await tx.leaveRequestItem.deleteMany({});
    await tx.leaveApproval.deleteMany({});
    await tx.leaveHistory.deleteMany({});
    await tx.leaveRequest.deleteMany({});
    await tx.leaveAllocation.deleteMany({});

    // 스탬프
    await tx.stampRequest.deleteMany({});
    await tx.stampCoupon.deleteMany({});
    await tx.stampCard.deleteMany({});

    // 완료 플래그 (동일 트랜잭션에서 기록해 2회 실행 방지)
    await tx.systemConfig.upsert({
      where: { key: DONE_KEY },
      update: { value: nowIso() },
      create: { key: DONE_KEY, value: nowIso() },
    });
  });

  console.log("[reset-leave-test-data] wiped leave/stamp/allocation tables.");
  console.log("[reset-leave-test-data] re-seed dev sample: prisma/seed.ts");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });

  const after = {
    leaveRequestItems: await prisma.leaveRequestItem.count(),
    leaveApprovals: await prisma.leaveApproval.count(),
    leaveHistories: await prisma.leaveHistory.count(),
    leaveRequests: await prisma.leaveRequest.count(),
    leaveAllocations: await prisma.leaveAllocation.count(),
    stampRequests: await prisma.stampRequest.count(),
    stampCoupons: await prisma.stampCoupon.count(),
    stampCards: await prisma.stampCard.count(),
    users: await prisma.user.count(),
    employees: await prisma.employee.count(),
  };
  console.log("[reset-leave-test-data] preview counts(after):", after);
  console.log("[reset-leave-test-data] DONE");
}

main()
  .catch((e) => {
    console.error("[reset-leave-test-data] FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


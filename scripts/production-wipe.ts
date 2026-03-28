/**
 * 운영 오픈 전 정리 스크립트 (테스트 데이터 삭제)
 *
 * 목표:
 * - 마스터/기초 데이터(휴가유형, 공휴일, 팀, 시스템설정 등)는 유지
 * - **공지사항·유동 양식(정의·제출)** 은 삭제하지 않음 (직접 편집/삭제 가능)
 * - 공지 작성자가 삭제 대상 사원이면, 삭제 전 작성자를 유지 계정(기본 admin 사원)으로 이관
 * - 계정/사원은 KEEP_USERNAMES에 적은 로그인만 남기고 나머지 삭제
 * - 휴가·제주·스탬프·알림·로그·토큰 등 운영 트랜잭션 데이터는 삭제 (휴가 할당 포함)
 *
 * 안전장치:
 * - 기본은 DRY RUN(삭제 안 함)
 * - 실제 삭제는 CONFIRM_WIPE=WIPE 를 명시해야 함
 *
 * 실행 예시:
 *   # 1) 삭제 프리뷰(기본)
 *   DATABASE_URL="mysql://..." npx tsx scripts/production-wipe.ts
 *
 *   # 2) 유지할 계정 지정(기본: admin,pm)
 *   KEEP_USERNAMES="admin,pm" npx tsx scripts/production-wipe.ts
 *
 *   # 3) 실제 삭제
 *   CONFIRM_WIPE=WIPE KEEP_USERNAMES="admin,pm" npx tsx scripts/production-wipe.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseCsv(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const keepUsernames = parseCsv(process.env.KEEP_USERNAMES);
  const keep = keepUsernames.length ? keepUsernames : ["admin", "pm"];

  const isWipe = (process.env.CONFIRM_WIPE ?? "").trim() === "WIPE";
  const modeLabel = isWipe ? "WIPE" : "DRY_RUN";

  console.log(`[production-wipe] mode=${modeLabel}`);
  console.log(`[production-wipe] keep usernames=${keep.join(", ")}`);

  const keepUsers = await prisma.user.findMany({
    where: { username: { in: keep } },
    select: { id: true, username: true, employeeId: true },
  });

  const keepUsernamesFound = new Set(keepUsers.map((u) => u.username));
  const missing = keep.filter((u) => !keepUsernamesFound.has(u));
  if (missing.length) {
    throw new Error(
      `유지할 계정(username)을 찾지 못했습니다: ${missing.join(", ")} (KEEP_USERNAMES 확인)`
    );
  }

  const keepUserIds = keepUsers.map((u) => u.id);
  const keepEmpIds = keepUsers.map((u) => u.employeeId);

  // 팀장(leaderId) FK 깨짐 방지: 유지 대상이 아닌 leaderId는 null 처리
  const teamsNeedNullLeader = await prisma.team.count({
    where: { leaderId: { not: null, notIn: keepEmpIds } as any },
  });

  // 트랜잭션/로그/토큰/샘플 데이터는 전부 삭제 (마스터는 유지)
  const counts = {
    passwordResetTokens: await prisma.passwordResetToken.count({
      where: { userId: { notIn: keepUserIds } },
    }),
    inviteTokens: await prisma.inviteToken.count({
      where: { employeeId: { notIn: keepEmpIds } },
    }),
    testBypass: await prisma.testBypass.count(),

    leaveRequestItems: await prisma.leaveRequestItem.count(),
    leaveApprovals: await prisma.leaveApproval.count(),
    leaveHistories: await prisma.leaveHistory.count(),
    leaveRequests: await prisma.leaveRequest.count(),
    leaveAllocations: await prisma.leaveAllocation.count(),

    jeju: await prisma.jejuAccommodation.count(),

    stampCoupons: await prisma.stampCoupon.count(),
    stampCards: await prisma.stampCard.count(),
    stampRequests: await prisma.stampRequest.count(),

    notifications: await prisma.notification.count(),
    notificationLogs: await prisma.notificationLog.count(),

    auditLogs: await prisma.auditLog.count(),
    schedulerLogs: await prisma.schedulerLog.count(),
    requestLogs: await prisma.requestLog.count(),

    noticesReassignAuthor: await prisma.notice.count({
      where: { authorId: { notIn: keepEmpIds } },
    }),

    usersToDelete: await prisma.user.count({
      where: { employeeId: { notIn: keepEmpIds } },
    }),
    employeesToDelete: await prisma.employee.count({
      where: { id: { notIn: keepEmpIds } },
    }),

    teamsNeedNullLeader,
  };

  console.log("[production-wipe] preview counts:", counts);

  if (!isWipe) {
    console.log(
      '[production-wipe] DRY_RUN 완료. 실제 삭제하려면 CONFIRM_WIPE=WIPE 로 다시 실행하세요.'
    );
    return;
  }

  console.log("[production-wipe] 삭제 시작...");

  await prisma.$transaction(async (tx) => {
    if (counts.teamsNeedNullLeader > 0) {
      await tx.team.updateMany({
        where: { leaderId: { not: null, notIn: keepEmpIds } as any },
        data: { leaderId: null },
      });
    }

    // 토큰류 (계정/사원 삭제 전 정리)
    await tx.passwordResetToken.deleteMany({
      where: { userId: { notIn: keepUserIds } },
    });
    await tx.inviteToken.deleteMany({
      where: { employeeId: { notIn: keepEmpIds } },
    });
    await tx.testBypass.deleteMany({});

    // 휴가 (요청/결재/이력/항목/할당)
    await tx.leaveRequestItem.deleteMany({});
    await tx.leaveApproval.deleteMany({});
    await tx.leaveHistory.deleteMany({});
    await tx.leaveRequest.deleteMany({});
    await tx.leaveAllocation.deleteMany({});

    // 제주 숙소
    await tx.jejuAccommodation.deleteMany({});

    // 스탬프
    await tx.stampRequest.deleteMany({});
    await tx.stampCoupon.deleteMany({});
    await tx.stampCard.deleteMany({});

    // 알림
    await tx.notification.deleteMany({});
    await tx.notificationLog.deleteMany({});

    // 로그
    await tx.auditLog.deleteMany({});
    await tx.schedulerLog.deleteMany({});
    await tx.requestLog.deleteMany({});

    // 공지: 삭제하지 않음 — 작성자가 곧 삭제될 사원이면 유지 계정으로 이관 (Notice.authorId FK)
    const fallbackAuthorId =
      keepUsers.find((u) => u.username === "admin")?.employeeId ?? keepEmpIds[0];
    const reassign = await tx.notice.updateMany({
      where: { authorId: { notIn: keepEmpIds } },
      data: { authorId: fallbackAuthorId },
    });
    if (reassign.count > 0) {
      console.log(`[production-wipe] 공지 ${reassign.count}건 작성자 → 유지 사원(${fallbackAuthorId})`);
    }

    // 계정/사원: 유지 대상만 남기고 삭제
    await tx.user.deleteMany({
      where: { employeeId: { notIn: keepEmpIds } },
    });
    await tx.employee.deleteMany({
      where: { id: { notIn: keepEmpIds } },
    });
  });

  console.log("[production-wipe] ✅ 삭제 완료. 남은 계정:", keep.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());


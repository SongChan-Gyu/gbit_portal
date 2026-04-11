/**
 * 운영 데이터 초기화(전체 wipe) — 스크립트·관리 화면 공통 로직
 *
 * KEEP_USERNAMES에 적은 로그인만 User/Employee 유지, 나머지 사원·휴가·제주·스탬프·알림·로그 등 삭제.
 * 공지는 삭제하지 않으며 작성자만 유지 사원으로 이관.
 */

import prisma from "@/lib/db";

export { PRODUCTION_WIPE_CONFIRM_PHRASE } from "@/lib/productionWipeConstants";

/** 폼에서 쉼표 구분 문자열로 들어온 유지 아이디 목록 */
export function parseKeepUsernamesFromInput(input: string | undefined | null): string[] {
  const raw = (input ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return raw.length ? raw : ["admin"];
}

function normalizeKeepList(keepUsernames: string[]): string[] {
  const u = keepUsernames.map((s) => s.trim()).filter(Boolean);
  return u.length ? u : ["admin"];
}

export type ProductionWipeCounts = {
  passwordResetTokens: number;
  inviteTokens: number;
  testBypass: number;
  leaveRequestItems: number;
  leaveApprovals: number;
  leaveHistories: number;
  leaveRequests: number;
  leaveAllocations: number;
  jeju: number;
  stampCoupons: number;
  stampCards: number;
  stampRequests: number;
  notifications: number;
  notificationLogs: number;
  auditLogs: number;
  schedulerLogs: number;
  noticesReassignAuthor: number;
  usersToDelete: number;
  employeesToDelete: number;
  teamsNeedNullLeader: number;
};

async function resolveKeepUsers(keepUsernames: string[]) {
  const keepUsers = await prisma.user.findMany({
    where: { username: { in: keepUsernames } },
    select: { id: true, username: true, employeeId: true },
  });
  const found = new Set(keepUsers.map((u) => u.username));
  const missing = keepUsernames.filter((u) => !found.has(u));
  if (missing.length) {
    throw new Error(`유지할 계정(아이디)을 찾지 못했습니다: ${missing.join(", ")}`);
  }
  const keepUserIds = keepUsers.map((u) => u.id);
  const keepEmpIds = keepUsers.map((u) => u.employeeId);
  return { keepUsers, keepUserIds, keepEmpIds };
}

export async function getProductionWipePreview(keepUsernames: string[]): Promise<{
  counts: ProductionWipeCounts;
  keep: string[];
}> {
  const keep = normalizeKeepList(keepUsernames);
  const { keepUsers, keepUserIds, keepEmpIds } = await resolveKeepUsers(keep);

  const teamsNeedNullLeader = await prisma.team.count({
    where: { leaderId: { not: null, notIn: keepEmpIds } as any },
  });

  const counts: ProductionWipeCounts = {
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

  return { counts, keep };
}

/** 실제 삭제 (트랜잭션). 호출 전 비밀번호·확인 문구는 API에서 검증할 것. */
export async function executeProductionWipe(keepUsernames: string[]): Promise<{ keep: string[] }> {
  const keep = normalizeKeepList(keepUsernames);
  const { keepUsers, keepUserIds, keepEmpIds } = await resolveKeepUsers(keep);

  const { counts } = await getProductionWipePreview(keep);

  await prisma.$transaction(async (tx) => {
    if (counts.teamsNeedNullLeader > 0) {
      await tx.team.updateMany({
        where: { leaderId: { not: null, notIn: keepEmpIds } as any },
        data: { leaderId: null },
      });
    }

    await tx.passwordResetToken.deleteMany({
      where: { userId: { notIn: keepUserIds } },
    });
    await tx.inviteToken.deleteMany({
      where: { employeeId: { notIn: keepEmpIds } },
    });
    await tx.testBypass.deleteMany({});

    await tx.leaveRequestItem.deleteMany({});
    await tx.leaveApproval.deleteMany({});
    await tx.leaveHistory.deleteMany({});
    await tx.leaveRequest.deleteMany({});
    await tx.leaveAllocation.deleteMany({});

    await tx.jejuAccommodation.deleteMany({});

    await tx.stampRequest.deleteMany({});
    await tx.stampCoupon.deleteMany({});
    await tx.stampCard.deleteMany({});

    await tx.notification.deleteMany({});
    await tx.notificationLog.deleteMany({});

    await tx.auditLog.deleteMany({});
    await tx.schedulerLog.deleteMany({});

    const fallbackAuthorId =
      keepUsers.find((u) => u.username === "admin")?.employeeId ?? keepEmpIds[0];
    await tx.notice.updateMany({
      where: { authorId: { notIn: keepEmpIds } },
      data: { authorId: fallbackAuthorId },
    });

    await tx.user.deleteMany({
      where: { employeeId: { notIn: keepEmpIds } },
    });
    await tx.employee.deleteMany({
      where: { id: { notIn: keepEmpIds } },
    });
  });

  return { keep };
}

import type { DB, DBTx } from "@/lib/db";

const APPROVER_ROLES = new Set(["TEAM_LEAD", "PM", "ADMIN"]);
const PENDING_LEAVE = ["PENDING", "CANCEL_PENDING"] as const;
const OPEN_LEAVE_REQUEST = ["PENDING", "CANCEL_REQUESTED"] as const;

export class TeamLeaderSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamLeaderSyncError";
  }
}

export type TeamLeaderSyncResult = {
  teamId: string;
  previousLeaderId: string | null;
  newLeaderId: string | null;
  promotedRole: boolean;
  demotedPrevious: boolean;
  alimtalkEnabled: boolean;
  phoneMissing: boolean;
  reassignedLeaveApprovals: number;
  reassignedStampRequests: number;
  warning: string | null;
};

export function phoneLooksSendable(phone: string | null | undefined): boolean {
  return (phone ?? "").replace(/\D/g, "").length >= 10;
}

export function roleAfterBecomingLeader(currentRole: string): string {
  return currentRole === "STAFF" ? "TEAM_LEAD" : currentRole;
}

export function roleAfterLeavingLeader(currentRole: string, stillLeadsOtherTeam: boolean): string {
  if (stillLeadsOtherTeam) return currentRole;
  return currentRole === "TEAM_LEAD" ? "STAFF" : currentRole;
}

/** 팀원(STAFF) 신청의 1단계 결재만 새 팀장에게 넘긴다. 팀장·PM·관리자 본인 건은 PM 결재로 둔다. */
export function shouldReassignMemberApproval(args: {
  applicantId: string;
  applicantRole: string;
  approverId: string | null;
  newLeaderId: string | null;
}): boolean {
  if (APPROVER_ROLES.has(args.applicantRole)) return false;
  if (args.newLeaderId && args.applicantId === args.newLeaderId) return false;
  if (args.newLeaderId && args.approverId === args.newLeaderId) return false;
  return true;
}

async function resolveFallbackPmId(tx: DBTx): Promise<string | null> {
  const cfg = await tx.systemConfig.findUnique({ where: { key: "leaveApprovalPMId" } });
  if (cfg?.value) {
    const designated = await tx.employee.findUnique({
      where: { id: cfg.value },
      select: { id: true, status: true },
    });
    if (designated?.status === "ACTIVE") return designated.id;
  }
  const pm = await tx.employee.findFirst({
    where: { role: "PM", status: "ACTIVE" },
    select: { id: true },
  });
  return pm?.id ?? null;
}

async function reassignOpenTeamApprovals(
  tx: DBTx,
  teamId: string,
  newApproverId: string | null,
  skipApplicantId: string | null,
): Promise<{ leave: number; stamp: number }> {
  const pendingLeave = await tx.leaveApproval.findMany({
    where: {
      step: 1,
      status: { in: [...PENDING_LEAVE] },
      leaveRequest: {
        currentStep: 1,
        status: { in: [...OPEN_LEAVE_REQUEST] },
        employee: { teamId },
      },
    },
    select: {
      id: true,
      approverId: true,
      leaveRequest: { select: { employeeId: true, employee: { select: { role: true } } } },
    },
  });

  const leaveIds = pendingLeave
    .filter((row) =>
      shouldReassignMemberApproval({
        applicantId: row.leaveRequest.employeeId,
        applicantRole: row.leaveRequest.employee.role,
        approverId: row.approverId,
        newLeaderId: newApproverId,
      }),
    )
    .map((row) => row.id);

  let leave = 0;
  if (leaveIds.length && newApproverId) {
    const updated = await tx.leaveApproval.updateMany({
      where: { id: { in: leaveIds } },
      data: { approverId: newApproverId },
    });
    leave = updated.count;
  }

  const pendingStamp = await tx.stampRequest.findMany({
    where: {
      status: "PENDING",
      employee: { teamId },
    },
    select: {
      id: true,
      approverId: true,
      employeeId: true,
      employee: { select: { role: true } },
    },
  });
  const stampIds = pendingStamp
    .filter((row) =>
      shouldReassignMemberApproval({
        applicantId: row.employeeId,
        applicantRole: row.employee.role,
        approverId: row.approverId,
        newLeaderId: newApproverId,
      }) && (!skipApplicantId || row.employeeId !== skipApplicantId),
    )
    .map((row) => row.id);

  let stamp = 0;
  if (stampIds.length) {
    const updated = await tx.stampRequest.updateMany({
      where: { id: { in: stampIds } },
      data: { approverId: newApproverId },
    });
    stamp = updated.count;
  }

  return { leave, stamp };
}

/** 새 팀장 본인 신청은 자기 결재가 되지 않게 PM에게 넘긴다. */
async function reassignNewLeaderOwnPendingToPm(
  tx: DBTx,
  newLeaderId: string,
  pmId: string | null,
): Promise<void> {
  if (!pmId || pmId === newLeaderId) return;
  await tx.leaveApproval.updateMany({
    where: {
      step: 1,
      status: { in: [...PENDING_LEAVE] },
      approverId: { not: pmId },
      leaveRequest: {
        employeeId: newLeaderId,
        currentStep: 1,
        status: { in: [...OPEN_LEAVE_REQUEST] },
      },
    },
    data: { approverId: pmId },
  });
  await tx.stampRequest.updateMany({
    where: {
      status: "PENDING",
      employeeId: newLeaderId,
      approverId: { not: pmId },
    },
    data: { approverId: pmId },
  });
}

export async function applyTeamLeaderChange(
  tx: DBTx,
  teamId: string,
  newLeaderId: string | null,
): Promise<TeamLeaderSyncResult> {
  const team = await tx.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, leaderId: true },
  });
  if (!team) throw new TeamLeaderSyncError("팀을 찾을 수 없습니다.");

  const previousLeaderId = team.leaderId;
  let promotedRole = false;
  let demotedPrevious = false;
  let alimtalkEnabled = false;
  let phoneMissing = false;
  let warning: string | null = null;

  if (newLeaderId) {
    const next = await tx.employee.findUnique({
      where: { id: newLeaderId },
      select: {
        id: true,
        name: true,
        role: true,
        status: true,
        phone: true,
        alimtalkEnabled: true,
        teamId: true,
        teamLeaderOf: { select: { id: true, name: true } },
      },
    });
    if (!next) throw new TeamLeaderSyncError("팀장으로 지정할 사원을 찾을 수 없습니다.");
    if (next.status === "INACTIVE") {
      throw new TeamLeaderSyncError(`${next.name}님은 퇴직 상태라 팀장으로 지정할 수 없습니다.`);
    }
    if (next.teamLeaderOf && next.teamLeaderOf.id !== teamId) {
      throw new TeamLeaderSyncError(
        `${next.name}님은 이미 ${next.teamLeaderOf.name} 팀장입니다. 그 팀 팀장을 먼저 해제해 주세요.`,
      );
    }
  }

  if (previousLeaderId !== newLeaderId) {
    await tx.team.update({
      where: { id: teamId },
      data: { leaderId: newLeaderId },
    });
  }

  const pmId = await resolveFallbackPmId(tx);
  const targetApproverId = newLeaderId ?? pmId;
  const moved = await reassignOpenTeamApprovals(tx, teamId, targetApproverId, newLeaderId);
  if (newLeaderId) {
    await reassignNewLeaderOwnPendingToPm(tx, newLeaderId, pmId);
  }

  if (newLeaderId) {
    const next = await tx.employee.findUnique({
      where: { id: newLeaderId },
      select: {
        id: true,
        name: true,
        role: true,
        phone: true,
        alimtalkEnabled: true,
        teamId: true,
      },
    });
    if (next) {
      const data: { role?: string; alimtalkEnabled?: boolean; teamId?: string } = {};
      const nextRole = roleAfterBecomingLeader(next.role);
      if (nextRole !== next.role) {
        data.role = nextRole;
        promotedRole = true;
      }
      const sendable = phoneLooksSendable(next.phone);
      phoneMissing = !sendable;
      if (sendable && !next.alimtalkEnabled) {
        data.alimtalkEnabled = true;
      }
      alimtalkEnabled = sendable ? true : next.alimtalkEnabled;
      if ((next.role === "STAFF" || next.role === "TEAM_LEAD") && next.teamId !== teamId) {
        data.teamId = teamId;
      }
      if (Object.keys(data).length > 0) {
        await tx.employee.update({ where: { id: next.id }, data });
      }
      if (phoneMissing) {
        warning = `${next.name}님 연락처가 없어 알림톡을 켤 수 없습니다. 사원 정보에서 번호를 넣어 주세요.`;
      }
    }
  }

  if (previousLeaderId && previousLeaderId !== newLeaderId) {
    const stillLeads = await tx.team.findFirst({
      where: { leaderId: previousLeaderId },
      select: { id: true },
    });
    const prev = await tx.employee.findUnique({
      where: { id: previousLeaderId },
      select: { role: true },
    });
    if (prev) {
      const nextRole = roleAfterLeavingLeader(prev.role, !!stillLeads);
      if (nextRole !== prev.role) {
        await tx.employee.update({ where: { id: previousLeaderId }, data: { role: nextRole } });
        demotedPrevious = true;
      }
    }
    const leftover = await tx.leaveApproval.findMany({
      where: {
        step: 1,
        status: { in: [...PENDING_LEAVE] },
        approverId: previousLeaderId,
        leaveRequest: {
          currentStep: 1,
          status: { in: [...OPEN_LEAVE_REQUEST] },
          employee: { teamId },
        },
      },
      select: { id: true, leaveRequest: { select: { employeeId: true } } },
    });
    const leftoverOwn = leftover
      .filter((row) => row.leaveRequest.employeeId === previousLeaderId)
      .map((row) => row.id);
    const leftoverOthers = leftover
      .filter((row) => row.leaveRequest.employeeId !== previousLeaderId)
      .map((row) => row.id);
    const ownDest = pmId && pmId !== previousLeaderId ? pmId : newLeaderId;
    if (leftoverOwn.length && ownDest) {
      await tx.leaveApproval.updateMany({
        where: { id: { in: leftoverOwn } },
        data: { approverId: ownDest },
      });
    }
    if (leftoverOthers.length && newLeaderId) {
      const extra = await tx.leaveApproval.updateMany({
        where: { id: { in: leftoverOthers } },
        data: { approverId: newLeaderId },
      });
      moved.leave += extra.count;
    }
    await tx.stampRequest.updateMany({
      where: {
        status: "PENDING",
        approverId: previousLeaderId,
        employee: { teamId, id: { not: previousLeaderId } },
      },
      data: { approverId: newLeaderId },
    });
    if (ownDest) {
      await tx.stampRequest.updateMany({
        where: {
          status: "PENDING",
          approverId: previousLeaderId,
          employeeId: previousLeaderId,
        },
        data: { approverId: ownDest },
      });
    }
  }

  const swept = await sweepApprovalsStuckOnStaff(tx, teamId, newLeaderId, pmId);
  moved.leave += swept.leave;
  moved.stamp += swept.stamp;

  return {
    teamId,
    previousLeaderId,
    newLeaderId,
    promotedRole,
    demotedPrevious,
    alimtalkEnabled,
    phoneMissing,
    reassignedLeaveApprovals: moved.leave,
    reassignedStampRequests: moved.stamp,
    warning,
  };
}

async function sweepApprovalsStuckOnStaff(
  tx: DBTx,
  teamId: string,
  newLeaderId: string | null,
  pmId: string | null,
): Promise<{ leave: number; stamp: number }> {
  const stuckLeave = await tx.leaveApproval.findMany({
    where: {
      step: 1,
      status: { in: [...PENDING_LEAVE] },
      leaveRequest: {
        currentStep: 1,
        status: { in: [...OPEN_LEAVE_REQUEST] },
        employee: { teamId },
      },
      approver: { role: "STAFF" },
    },
    select: { id: true, approverId: true, leaveRequest: { select: { employeeId: true } } },
  });
  let leave = 0;
  for (const row of stuckLeave) {
    const own =
      row.leaveRequest.employeeId === row.approverId ||
      (newLeaderId != null && row.leaveRequest.employeeId === newLeaderId);
    const dest = own ? pmId ?? newLeaderId : newLeaderId ?? pmId;
    if (!dest || dest === row.approverId) continue;
    await tx.leaveApproval.update({ where: { id: row.id }, data: { approverId: dest } });
    leave += 1;
  }

  const stuckStamp = await tx.stampRequest.findMany({
    where: {
      status: "PENDING",
      employee: { teamId },
      approver: { role: "STAFF" },
    },
    select: { id: true, approverId: true, employeeId: true },
  });
  let stamp = 0;
  for (const row of stuckStamp) {
    const own = row.employeeId === row.approverId || (newLeaderId != null && row.employeeId === newLeaderId);
    const dest = own ? pmId ?? newLeaderId : newLeaderId ?? pmId;
    if (!dest || dest === row.approverId) continue;
    await tx.stampRequest.update({ where: { id: row.id }, data: { approverId: dest } });
    stamp += 1;
  }
  return { leave, stamp };
}

export type TeamLeaderHealth = {
  team: { id: string; name: string; leaderId: string | null } | null;
  leader: {
    id: string;
    name: string;
    role: string;
    status: string;
    phone: string;
    alimtalkEnabled: boolean;
  } | null;
  extraTeamLeads: { id: string; name: string; role: string }[];
  pendingLeave: {
    id: string;
    applicant: string;
    applicantRole: string;
    approver: string;
    approverRole: string;
    status: string;
  }[];
  pendingStamp: {
    id: string;
    applicant: string;
    applicantRole: string;
    approver: string | null;
    approverRole: string | null;
  }[];
};

export async function inspectTeamLeaderHealth(db: DB | DBTx, teamName: string): Promise<TeamLeaderHealth> {
  const team = await db.team.findFirst({
    where: { name: teamName },
    select: {
      id: true,
      name: true,
      leaderId: true,
      leader: {
        select: {
          id: true,
          name: true,
          role: true,
          status: true,
          phone: true,
          alimtalkEnabled: true,
        },
      },
      employees: {
        where: { role: "TEAM_LEAD", status: { not: "INACTIVE" } },
        select: { id: true, name: true, role: true },
      },
    },
  });
  if (!team) {
    return { team: null, leader: null, extraTeamLeads: [], pendingLeave: [], pendingStamp: [] };
  }

  const pendingLeaveRows = await db.leaveApproval.findMany({
    where: {
      status: { in: [...PENDING_LEAVE] },
      leaveRequest: { employee: { teamId: team.id } },
    },
    select: {
      id: true,
      status: true,
      approver: { select: { name: true, role: true } },
      leaveRequest: { select: { employee: { select: { name: true, role: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const pendingStampRows = await db.stampRequest.findMany({
    where: { status: "PENDING", employee: { teamId: team.id } },
    select: {
      id: true,
      employee: { select: { name: true, role: true } },
      approver: { select: { name: true, role: true } },
    },
    take: 50,
  });

  return {
    team: { id: team.id, name: team.name, leaderId: team.leaderId },
    leader: team.leader,
    extraTeamLeads: team.employees.filter((e) => e.id !== team.leaderId),
    pendingLeave: pendingLeaveRows.map((row) => ({
      id: row.id,
      applicant: row.leaveRequest.employee.name,
      applicantRole: row.leaveRequest.employee.role,
      approver: row.approver.name,
      approverRole: row.approver.role,
      status: row.status,
    })),
    pendingStamp: pendingStampRows.map((row) => ({
      id: row.id,
      applicant: row.employee.name,
      applicantRole: row.employee.role,
      approver: row.approver?.name ?? null,
      approverRole: row.approver?.role ?? null,
    })),
  };
}

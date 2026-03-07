/**
 * 감사 로그(AuditLog) 중앙 집중 유틸리티
 * - 실패해도 메인 트랜잭션을 막지 않음 (fire-and-forget with catch)
 */
import prisma from "@/lib/db";

export type AuditAction =
  | "CREATED" | "UPDATED" | "DELETED"
  | "APPROVED" | "REJECTED" | "CANCELLED" | "RESTORED"
  | "GRANTED" | "ADJUSTED" | "DEACTIVATED"
  | "LOGIN" | "INVITE_SENT" | "REGISTERED"
  | "SCHEDULER_RUN";

export interface AuditOptions {
  entityType: string;
  entityId:   string;
  action:     AuditAction;
  actorId?:   string | null;
  actorName?: string;          // 시스템 자동 실행 등 actorId 없을 때
  before?:    object | null;
  after?:     object | null;
  note?:      string;
  ip?:        string;
}

/** 감사 로그 기록 (비동기, 실패 무시) */
export async function writeAudit(opts: AuditOptions): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: opts.entityType,
        entityId:   opts.entityId,
        action:     opts.action,
        actorId:    opts.actorId ?? null,
        actorName:  opts.actorName ?? null,
        before:     opts.before  ? JSON.stringify(opts.before)  : null,
        after:      opts.after   ? JSON.stringify(opts.after)   : null,
        note:       opts.note    ?? null,
        ip:         opts.ip      ?? null,
      },
    });
  } catch (e) {
    // 로그 기록 실패는 조용히 처리 (메인 작업 방해 안 함)
    console.error("[AuditLog] write failed:", e);
  }
}

/** 스케줄러 실행 이력 기록 */
export async function writeSchedulerLog(opts: {
  jobName:     string;
  targetParam?: string;
  isDryRun?:   boolean;
  status:      "SUCCESS" | "PARTIAL" | "FAILED";
  grantedCount: number;
  skippedCount: number;
  errorCount:  number;
  detail?:     object;
  triggeredBy?: string;
  actorId?:    string | null;
}): Promise<void> {
  try {
    await prisma.schedulerLog.create({
      data: {
        jobName:      opts.jobName,
        targetParam:  opts.targetParam ?? null,
        isDryRun:     opts.isDryRun ?? false,
        status:       opts.status,
        grantedCount: opts.grantedCount,
        skippedCount: opts.skippedCount,
        errorCount:   opts.errorCount,
        detail:       opts.detail ? JSON.stringify(opts.detail) : null,
        triggeredBy:  opts.triggeredBy ?? "SYSTEM",
        actorId:      opts.actorId ?? null,
      },
    });
  } catch (e) {
    console.error("[SchedulerLog] write failed:", e);
  }
}

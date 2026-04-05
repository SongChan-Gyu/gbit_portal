import prisma from "@/lib/db";
import { writeAudit, writeSchedulerLog } from "@/lib/audit";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface JejuDepositDeadlineResult {
  isDryRun: boolean;
  deadlineDays: number;
  candidates: number;
  cancelled: string[];
  errors: { id: string; error: string }[];
}

/** 1차 승인 후 입금 미확인 상태가 N일 지나면 STEP1_APPROVED → CANCELLED (신청자 알림톡은 발송하지 않음) */
export async function runJejuDepositDeadline(opts: {
  dryRun?: boolean;
  actorId?: string | null;
} = {}): Promise<JejuDepositDeadlineResult> {
  const dryRun = opts.dryRun ?? false;
  const parsed = parseInt(process.env.JEJU_DEPOSIT_DEADLINE_DAYS ?? "5", 10);
  const deadlineDays = Number.isFinite(parsed) && parsed >= 1 ? parsed : 5;

  const now = new Date();
  const rows = await prisma.jejuAccommodation.findMany({
    where: {
      status: "STEP1_APPROVED",
      depositStatus: "NONE",
      step1ApprovedAt: { not: null },
    },
    include: {
      employee: { select: { id: true, name: true, phone: true, alimtalkEnabled: true } },
    },
  });

  const due = rows.filter(
    (r) =>
      r.step1ApprovedAt != null &&
      now.getTime() >= r.step1ApprovedAt.getTime() + deadlineDays * MS_PER_DAY,
  );

  const cancelled: string[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const row of due) {
    if (dryRun) {
      cancelled.push(row.id);
      continue;
    }
    try {
      await prisma.jejuAccommodation.update({
        where: { id: row.id },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: `입금 확인 기한(${deadlineDays}일) 초과 — 시스템 자동 취소`,
        },
      });
      await writeAudit({
        entityType: "JejuAccommodation",
        entityId: row.id,
        action: "CANCELLED",
        actorId: opts.actorId ?? null,
        actorName: opts.actorId ? undefined : "스케줄러(제주)",
        after: { status: "CANCELLED", depositDeadlineDays: deadlineDays },
        note: "입금 미확인 기한 초과 자동취소",
      });
      cancelled.push(row.id);
    } catch (e: unknown) {
      errors.push({ id: row.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!dryRun) {
    const st =
      errors.length > 0 ? (cancelled.length > 0 ? "PARTIAL" : "FAILED") : "SUCCESS";
    await writeSchedulerLog({
      jobName: "jeju_deposit_deadline",
      targetParam: `${deadlineDays}일`,
      isDryRun: false,
      status: st,
      grantedCount: cancelled.length,
      skippedCount: rows.length - due.length,
      errorCount: errors.length,
      detail: { cancelled, errors, candidateIds: due.map((r) => r.id) },
      triggeredBy: opts.actorId ? "ADMIN" : "SYSTEM",
      actorId: opts.actorId ?? null,
    });
  }

  return {
    isDryRun: dryRun,
    deadlineDays,
    candidates: due.length,
    cancelled,
    errors,
  };
}

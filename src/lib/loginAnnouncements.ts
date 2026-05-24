import type { DB } from "@/lib/db";
import { employeeMatchesAudience } from "@/lib/audienceAccess";

export type LoginAnnouncementView = {
  id: string;
  title: string;
  body: string;
  detailMode: string;
  noticeId: string | null;
  noticeTitle: string | null;
};

function isDismissedActive(
  dismiss: { dismissType: string; dismissedUntil: Date | null } | undefined,
  now: Date,
): boolean {
  if (!dismiss) return false;
  // DB에는 7일 보지 않기(WEEK)만 저장. 확인(CLOSE)은 클라이언트 세션에서만 처리.
  if (dismiss.dismissType === "WEEK" && dismiss.dismissedUntil && dismiss.dismissedUntil > now) {
    return true;
  }
  return false;
}

/** 로그인 직원에게 지금 보여 줄 활성 팝업 (우선순위 1건) */
export async function getActiveLoginAnnouncementForEmployee(
  prisma: DB,
  employeeId: string,
  employeeType: string | null | undefined,
): Promise<LoginAnnouncementView | null> {
  const now = new Date();
  const rows = await prisma.loginAnnouncement.findMany({
    where: {
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: {
      notice: { select: { id: true, title: true } },
      dismissals: { where: { employeeId }, take: 1 },
    },
  });

  for (const row of rows) {
    const ok = await employeeMatchesAudience(prisma, employeeId, employeeType, {
      audience: row.audience,
      employeeGroupId: row.employeeGroupId,
    });
    if (!ok) continue;
    if (isDismissedActive(row.dismissals[0], now)) continue;
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      detailMode: row.detailMode,
      noticeId: row.noticeId,
      noticeTitle: row.notice?.title ?? null,
    };
  }
  return null;
}

export function dismissUntilForType(type: "WEEK", now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 7);
  return d;
}

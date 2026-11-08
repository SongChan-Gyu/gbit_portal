import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { kstYmd } from "@/lib/dateUtils";
import { getJejuCalendarYearStats, buildJejuYearlyUsageInfo } from "@/lib/jejuYearStats";
import { todayStr } from "@/lib/workdays";
import {
  JEJU_OCCUPYING_STATUSES,
  jejuCheckoutTimeLabel,
  resetJejuCheckoutDelaysWhenCheckInExists,
} from "@/lib/jejuCheckoutDelay";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const [list, applicant] = await Promise.all([
    prisma.jejuAccommodation.findMany({
      where: { employeeId: user.employeeId },
      include: { employee: { select: { name: true } } },
      orderBy: { startDate: "desc" },
    }),
    prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { position: true, employeeType: true },
    }),
  ]);

  const occupyingCheckIns =
    list.length === 0
      ? []
      : await prisma.jejuAccommodation.findMany({
          where: {
            status: { in: [...JEJU_OCCUPYING_STATUSES] },
            startDate: { in: [...new Set(list.map((r) => r.endDate))] },
          },
          select: { id: true, startDate: true },
        });
  const resetIds = await resetJejuCheckoutDelaysWhenCheckInExists(prisma, list);

  const calendarYear = parseInt(todayStr().slice(0, 4), 10);
  const yearStats = await getJejuCalendarYearStats(prisma, user.employeeId, calendarYear);
  const yearlyUsage = buildJejuYearlyUsageInfo(yearStats, applicant);

  return NextResponse.json({
    yearStats,
    yearlyUsage,
    requests: list.map((r) => {
      const delayHours = resetIds.has(r.id) ? 0 : r.checkoutDelayHours;
      const checkoutDelayAllowed = !occupyingCheckIns.some(
        (c) => c.id !== r.id && c.startDate.getTime() === r.endDate.getTime(),
      );
      return {
        id: r.id,
        startDate: kstYmd(r.startDate),
        endDate: kstYmd(r.endDate),
        nights: r.nights,
        checkoutDelayHours: delayHours,
        checkoutTime: jejuCheckoutTimeLabel(delayHours),
        checkoutDelayAllowed,
        reason: r.reason,
        guestName: r.guestName,
        guestPhone: r.guestPhone,
        guestCount: r.guestCount,
        depositorName: r.depositorName,
        applicantName: r.employee.name,
        status: r.status,
        step1ApprovedAt: r.step1ApprovedAt?.toISOString() ?? null,
        approvedAt: r.approvedAt?.toISOString() ?? null,
        depositStatus: r.depositStatus,
        depositConfirmedAt: r.depositConfirmedAt?.toISOString() ?? null,
        rejectStep: r.rejectStep,
        rejectComment: r.rejectComment,
        cancelledAt: r.cancelledAt?.toISOString() ?? null,
        cancelReason: r.cancelReason,
        cancelRequestedAt: r.cancelRequestedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  });
}

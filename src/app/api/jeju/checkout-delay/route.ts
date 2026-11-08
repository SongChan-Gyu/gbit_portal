import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";
import {
  JEJU_OCCUPYING_STATUSES,
  jejuCheckoutTimeLabel,
  jejuHasCheckInOnDate,
  parseCheckoutDelayHours,
} from "@/lib/jejuCheckoutDelay";

/**
 * PATCH /api/jeju/checkout-delay
 * 본인 예약의 퇴실 지연(0~3시간). 결재 상태는 바꾸지 않음.
 * 1~3시간은 퇴실 당일 입실 예약이 없을 때만 가능.
 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { employeeId?: string };

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const hours = parseCheckoutDelayHours(body.hours);
  if (!requestId) return NextResponse.json({ error: "requestId가 필요합니다." }, { status: 400 });
  if (hours == null) {
    return NextResponse.json({ error: "퇴실 지연은 0~3시간 중에서 선택해 주세요." }, { status: 400 });
  }

  const row = await prisma.jejuAccommodation.findUnique({
    where: { id: requestId },
    select: { id: true, employeeId: true, status: true, endDate: true, checkoutDelayHours: true },
  });
  if (!row) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (row.employeeId !== user.employeeId) {
    return NextResponse.json({ error: "본인 신청만 변경할 수 있습니다." }, { status: 403 });
  }
  if (!(JEJU_OCCUPYING_STATUSES as readonly string[]).includes(row.status)) {
    return NextResponse.json({ error: "진행 중인 예약만 퇴실 시간을 변경할 수 있습니다." }, { status: 400 });
  }

  if (hours > 0) {
    const hasCheckIn = await jejuHasCheckInOnDate(prisma, row.endDate, row.id);
    if (hasCheckIn) {
      return NextResponse.json(
        { error: "퇴실 당일 입실하는 예약이 있어 퇴실 시간을 연장할 수 없습니다." },
        { status: 400 },
      );
    }
  }

  if (row.checkoutDelayHours !== hours) {
    await prisma.jejuAccommodation.update({
      where: { id: requestId },
      data: { checkoutDelayHours: hours },
    });
    await writeAudit({
      entityType: "JejuAccommodation",
      entityId: requestId,
      action: "UPDATED",
      actorId: user.employeeId,
      after: { checkoutDelayHours: hours, checkoutTime: jejuCheckoutTimeLabel(hours) },
      ip: getIp(req) ?? undefined,
    });
  }

  return NextResponse.json({
    ok: true,
    checkoutDelayHours: hours,
    checkoutTime: jejuCheckoutTimeLabel(hours),
  });
}

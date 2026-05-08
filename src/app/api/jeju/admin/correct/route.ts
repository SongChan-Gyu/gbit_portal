import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { jejuKstMidnightFromYmdStr, calcNights } from "@/lib/jeju";
import { kstYmd } from "@/lib/dateUtils";
import { writeAudit, getIp } from "@/lib/audit";

/** PM/ADMIN 전용: 제주 숙소 신청 정보 목록 조회 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (!["PM", "ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "PM/ADMIN만 접근 가능합니다." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = 30;

  const where = q
    ? {
        OR: [
          { employee: { name: { contains: q } } },
          { guestName: { contains: q } },
          { guestPhone: { contains: q } },
        ],
      }
    : {};

  const [total, list] = await Promise.all([
    prisma.jejuAccommodation.count({ where }),
    prisma.jejuAccommodation.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true, empNo: true, team: { select: { name: true } } } },
      },
      orderBy: { startDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    rows: list.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      empNo: r.employee.empNo,
      teamName: r.employee.team?.name ?? null,
      startDate: kstYmd(r.startDate),
      endDate: kstYmd(r.endDate),
      nights: r.nights,
      status: r.status,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestCount: r.guestCount,
      depositorName: r.depositorName,
      reason: r.reason,
    })),
  });
}

/** PM/ADMIN 전용: 제주 숙소 신청 정보 정정 (날짜·투숙 정보) */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (!["PM", "ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "PM/ADMIN만 접근 가능합니다." }, { status: 403 });
  }

  const body = await req.json();
  const {
    id,
    startDate: startStr,
    endDate: endStr,
    guestName,
    guestPhone,
    guestCount,
    depositorName,
    reason,
  } = body as {
    id: string;
    startDate?: string;
    endDate?: string;
    guestName?: string;
    guestPhone?: string;
    guestCount?: number;
    depositorName?: string;
    reason?: string;
  };

  if (!id) return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });

  const record = await prisma.jejuAccommodation.findUnique({ where: { id } });
  if (!record) return NextResponse.json({ error: "해당 신청을 찾을 수 없습니다." }, { status: 404 });

  const updates: Record<string, unknown> = {};

  if (startStr || endStr) {
    const sYmd = startStr?.slice(0, 10) ?? kstYmd(record.startDate);
    const eYmd = endStr?.slice(0, 10) ?? kstYmd(record.endDate);
    if (sYmd >= eYmd) {
      return NextResponse.json({ error: "퇴실일은 입실일 다음 날 이상이어야 합니다." }, { status: 400 });
    }
    updates.startDate = jejuKstMidnightFromYmdStr(sYmd);
    updates.endDate = jejuKstMidnightFromYmdStr(eYmd);
    updates.nights = calcNights(
      updates.startDate as Date,
      updates.endDate as Date,
    );
  }

  if (guestName !== undefined) updates.guestName = guestName.trim();
  if (guestPhone !== undefined) updates.guestPhone = guestPhone.trim();
  if (typeof guestCount === "number") updates.guestCount = guestCount;
  if (depositorName !== undefined) updates.depositorName = depositorName.trim();
  if (reason !== undefined) updates.reason = reason.trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다." }, { status: 400 });
  }

  const updated = await prisma.jejuAccommodation.update({
    where: { id },
    data: updates,
  });

  await writeAudit({
    entityType: "JejuAccommodation",
    entityId: id,
    action: "UPDATED",
    actorId: user.employeeId,
    before: {
      startDate: kstYmd(record.startDate),
      endDate: kstYmd(record.endDate),
      nights: record.nights,
      guestName: record.guestName,
      guestPhone: record.guestPhone,
    },
    after: updates,
    ip: getIp(req) ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    id: updated.id,
    startDate: kstYmd(updated.startDate),
    endDate: kstYmd(updated.endDate),
    nights: updated.nights,
  });
}

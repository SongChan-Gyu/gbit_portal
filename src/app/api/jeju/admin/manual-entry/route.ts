import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept, calcNights, jejuKstMidnightFromYmdStr } from "@/lib/jeju";
import { writeAudit, getIp } from "@/lib/audit";

async function canManageJeju(user: { employeeId?: string; role?: string }) {
  if (user.role === "PM" || user.role === "ADMIN") return true;
  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true },
  });
  return isWelfareDept(emp);
}

/**
 * POST /api/jeju/admin/manual-entry
 * 시스템 도입 전 이관 처리용 — 즉시 APPROVED + 입금확인 상태로 내역 생성.
 * 복지부·PM·ADMIN 전용.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (!(await canManageJeju(user)))
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const {
    employeeId,
    startDate: startStr,
    endDate: endStr,
    guestName: guestNameRaw,
    guestPhone: guestPhoneRaw,
    guestCount: guestCountRaw,
    depositorName: depositorRaw,
    note,
  } = body as {
    employeeId?: string;
    startDate?: string;
    endDate?: string;
    guestName?: string;
    guestPhone?: string;
    guestCount?: number | string;
    depositorName?: string;
    note?: string;
  };

  if (!employeeId) return NextResponse.json({ error: "신청자를 선택해 주세요." }, { status: 400 });
  if (!startStr || !endStr) return NextResponse.json({ error: "입실일·퇴실일을 입력해 주세요." }, { status: 400 });

  const guestName = (guestNameRaw ?? "").trim();
  const guestPhone = (guestPhoneRaw ?? "").trim();
  const depositorName = (depositorRaw ?? "").trim();
  const guestCount =
    typeof guestCountRaw === "number"
      ? guestCountRaw
      : parseInt(String(guestCountRaw ?? ""), 10);

  if (!guestName) return NextResponse.json({ error: "투숙객 이름을 입력해 주세요." }, { status: 400 });
  if (!guestPhone) return NextResponse.json({ error: "투숙객 연락처를 입력해 주세요." }, { status: 400 });
  if (!depositorName) return NextResponse.json({ error: "입금자명을 입력해 주세요." }, { status: 400 });
  if (!Number.isInteger(guestCount) || guestCount < 1)
    return NextResponse.json({ error: "입실 인원을 1명 이상 입력해 주세요." }, { status: 400 });

  const sY = startStr.slice(0, 10);
  const eY = endStr.slice(0, 10);
  if (sY >= eY)
    return NextResponse.json({ error: "퇴실일은 입실일 다음 날 이상이어야 합니다." }, { status: 400 });

  const startDate = jejuKstMidnightFromYmdStr(sY);
  const endDate = jejuKstMidnightFromYmdStr(eY);
  const nights = calcNights(startDate, endDate);

  const targetEmp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, name: true },
  });
  if (!targetEmp) return NextResponse.json({ error: "선택한 사원을 찾을 수 없습니다." }, { status: 404 });

  const now = new Date();
  const actorId = user.employeeId as string;

  try {
    const created = await prisma.$transaction(async (tx) => {
      // 날짜 중복 체크 — 모든 사원 기준, 활성 예약과 겹치면 안 됨
      const overlap = await tx.jejuAccommodation.findFirst({
        where: {
          status: { in: ["PENDING", "STEP1_APPROVED", "APPROVED"] },
          startDate: { lt: endDate },
          endDate: { gt: startDate },
        },
        select: {
          id: true,
          employee: { select: { name: true } },
          startDate: true,
          endDate: true,
        },
      });
      if (overlap) {
        const os = overlap.startDate.toISOString().slice(0, 10);
        const oe = overlap.endDate.toISOString().slice(0, 10);
        throw Object.assign(new Error("OVERLAP"), {
          detail: `${overlap.employee.name}님의 예약(${os} ~ ${oe})과 겹칩니다.`,
        });
      }

      return tx.jejuAccommodation.create({
        data: {
          employeeId,
          startDate,
          endDate,
          nights,
          guestName,
          guestPhone,
          guestCount,
          depositorName,
          reason: (note ?? "").trim() || "이관 처리",
          status: "APPROVED",
          // 1차 승인 (복지부)
          step1ApproverId: actorId,
          step1ApprovedAt: now,
          // 2차 승인 (입금확인)
          approvedById: actorId,
          approvedAt: now,
          depositStatus: "CONFIRMED",
          depositConfirmedById: actorId,
          depositConfirmedAt: now,
        },
      });
    });

    await writeAudit({
      entityType: "JejuAccommodation",
      entityId: created.id,
      action: "CREATED",
      actorId,
      after: {
        employeeId,
        startDate: sY,
        endDate: eY,
        nights,
        status: "APPROVED",
        depositStatus: "CONFIRMED",
        note: (note ?? "").trim() || "이관 처리",
      },
      ip: getIp(req) ?? undefined,
    });

    return NextResponse.json({ ok: true, id: created.id, nights });
  } catch (e: unknown) {
    const err = e as Error & { detail?: string };
    if (err?.message === "OVERLAP") {
      return NextResponse.json({ error: err.detail ?? "날짜가 겹치는 예약이 있습니다." }, { status: 409 });
    }
    throw e;
  }
}

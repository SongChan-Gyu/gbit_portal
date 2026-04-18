import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  calcNights,
  isJejuDateBookable,
  jejuKstMidnightFromYmdStr,
  jejuPeriodTouchesBlockedYmds,
  JEJU_MAX_NIGHTS_DEFAULT,
} from "@/lib/jeju";
import { sendJejuNotification } from "@/lib/jejuNotify";

async function getBlockedDates(): Promise<string[]> {
  try {
    const c = await prisma.systemConfig.findUnique({ where: { key: "jejuBlockedDates" } });
    if (!c?.value) return [];
    const arr = JSON.parse(c.value);
    return Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const body = await req.json();
  const { startDate: startStr, endDate: endStr, reason, guestName, guestPhone, guestCount, depositorName: depositorRaw } = body as {
    startDate: string;
    endDate: string;
    reason?: string;
    guestName?: string;
    guestPhone?: string;
    guestCount?: number;
    depositorName?: string;
  };

  if (!startStr || !endStr) {
    return NextResponse.json({ error: "이용일을 선택해 주세요." }, { status: 400 });
  }

  const name = (guestName ?? "").trim();
  const phone = (guestPhone ?? "").trim();
  const depositorName = (depositorRaw ?? "").trim();
  const count = typeof guestCount === "number" ? guestCount : parseInt(String(guestCount ?? ""), 10);
  if (!name) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "연락처를 입력해 주세요." }, { status: 400 });
  if (!depositorName) return NextResponse.json({ error: "입금자명을 입력해 주세요. (예약금 이체 시 사용)" }, { status: 400 });
  if (!Number.isInteger(count) || count < 1) {
    return NextResponse.json({ error: "입실 인원을 1명 이상 입력해 주세요." }, { status: 400 });
  }

  const sY = startStr.slice(0, 10);
  const eY = endStr.slice(0, 10);
  const startDate = jejuKstMidnightFromYmdStr(sY);
  const endDate = jejuKstMidnightFromYmdStr(eY);

  if (sY >= eY) {
    return NextResponse.json({ error: "제주도 숙소는 1박 이상(퇴실일이 입실일 다음 날 이상)만 신청할 수 있습니다." }, { status: 400 });
  }

  if (!isJejuDateBookable(startDate)) {
    return NextResponse.json({
      error: "예약 시작일(입실일)은 매월 1일 기준 2달 후 말일까지만 선택 가능합니다. 선택한 시작일이 해당 기간을 넘었습니다.",
    }, { status: 400 });
  }

  const blockedDates = await getBlockedDates();
  if (jejuPeriodTouchesBlockedYmds(startDate, endDate, blockedDates)) {
    return NextResponse.json({
      error: "선택한 기간 중 예약이 불가한 날짜가 포함되어 있습니다. 숙소 정보 또는 관리자에게 문의하세요.",
    }, { status: 400 });
  }

  const nights = calcNights(startDate, endDate);
  let maxNights = JEJU_MAX_NIGHTS_DEFAULT;
  try {
    const config = await prisma.systemConfig.findUnique({ where: { key: "jejuMaxNights" } });
    if (config?.value) {
      const n = parseInt(config.value, 10);
      if (!isNaN(n) && n >= 1) maxNights = n;
    }
  } catch {
    // ignore
  }
  if (nights > maxNights) {
    return NextResponse.json({ error: `최대 연박은 ${maxNights}일입니다.` }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const overlapping = await tx.jejuAccommodation.findFirst({
        where: {
          employeeId: user.employeeId,
          status: { in: ["PENDING", "STEP1_APPROVED", "APPROVED"] },
          OR: [
            { startDate: { lte: endDate }, endDate: { gte: startDate } },
          ],
        },
      });
      if (overlapping) {
        throw new Error("OVERLAP");
      }
      return tx.jejuAccommodation.create({
        data: {
          employeeId: user.employeeId,
          startDate,
          endDate,
          nights,
          reason: reason?.trim() || null,
          guestName: name,
          guestPhone: phone,
          guestCount: count,
          depositorName,
          status: "PENDING",
        },
      });
    });
    const { writeAudit, getIp } = await import("@/lib/audit");
    await writeAudit({
      entityType: "JejuAccommodation",
      entityId: created.id,
      action: "CREATED",
      actorId: user.employeeId,
      after: { startDate, endDate, nights, status: "PENDING" },
      ip: getIp(req) ?? undefined,
    });
    // 복지부에게 승인 요청 알림
    const emp = await prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { id: true, name: true, phone: true, alimtalkEnabled: true },
    });
    if (emp) {
      await sendJejuNotification(prisma, "step1_notify", emp, created, 1).catch(console.warn);
    }
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e: any) {
    if (e?.message === "OVERLAP") {
      return NextResponse.json({
        error: "선택한 기간과 겹치는 신청이 이미 있습니다. 기존 신청을 취소하거나 다른 날짜를 선택해 주세요.",
      }, { status: 400 });
    }
    throw e;
  }
}

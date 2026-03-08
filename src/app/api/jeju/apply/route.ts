import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { calcNights, isJejuDateBookable, JEJU_MAX_NIGHTS_DEFAULT } from "@/lib/jeju";

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

/** 선택 기간 내 하루라도 예약 불가일이 있으면 true */
function periodOverlapsBlocked(startDate: Date, endDate: Date, blocked: string[]): boolean {
  const set = new Set(blocked);
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (set.has(d.toISOString().slice(0, 10))) return true;
  }
  return false;
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

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (startDate > endDate) {
    return NextResponse.json({ error: "이용일이 올바르지 않습니다." }, { status: 400 });
  }

  if (!isJejuDateBookable(startDate)) {
    return NextResponse.json({
      error: "매월 1일 기준 2달 후 말일까지만 예약 가능합니다. 선택한 시작일이 예약 가능 기간을 넘었습니다.",
    }, { status: 400 });
  }

  const blockedDates = await getBlockedDates();
  if (periodOverlapsBlocked(startDate, endDate, blockedDates)) {
    return NextResponse.json({
      error: "선택한 기간 중 예약이 불가한 날짜가 포함되어 있습니다. 숙소 정보 또는 관리자에게 문의하세요.",
    }, { status: 400 });
  }

  const nights = startStr === endStr ? 1 : Math.max(1, calcNights(startDate, endDate));
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
          status: { in: ["PENDING", "APPROVED"] },
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

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { addDaysYMD, kstYmd, todayKstYmd } from "@/lib/dateUtils";
import { kstEndOfDay, kstMidnightFromYmd } from "@/lib/workdays";
import {
  loadJejuExternalStayViewConfig,
  verifyJejuExternalStayCookie,
  COOKIE_NAME,
} from "@/lib/jejuExternalStayView";

/** 복지부 달력과 동일하게: 최종·1차승인·신청 중 점유는 반영하되, 외부(청소)용 표에는 확정·입금대기만 노출 */
const EXTERNAL_STATUSES = ["APPROVED", "STEP1_APPROVED"] as const;

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const cfg = await loadJejuExternalStayViewConfig();
  if (!cfg.enabled || !cfg.urlToken || cfg.urlToken !== token) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다." }, { status: 404 });
  }

  const cookieHeader = req.headers.get("cookie") ?? "";
  let cookieVal: string | undefined;
  for (const part of cookieHeader.split(";")) {
    const p = part.trim();
    if (!p.startsWith(`${COOKIE_NAME}=`)) continue;
    cookieVal = decodeURIComponent(p.slice(COOKIE_NAME.length + 1).trim());
    break;
  }
  const session = verifyJejuExternalStayCookie(cookieVal);
  if (!session || session.urlToken !== token) {
    return NextResponse.json({ error: "잠금 해제가 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from")?.slice(0, 10) ?? todayKstYmd();
  const toStr = searchParams.get("to")?.slice(0, 10) ?? addDaysYMD(todayKstYmd(), 365);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    return NextResponse.json({ error: "from, to는 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 });
  }

  const from = kstMidnightFromYmd(fromStr);
  const [ty, tm, td] = toStr.split("-").map((x) => parseInt(x, 10));
  const to = kstEndOfDay(ty, tm, td);

  const rows = await prisma.jejuAccommodation.findMany({
    where: {
      status: { in: [...EXTERNAL_STATUSES] },
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      nights: true,
      guestName: true,
      guestCount: true,
      status: true,
    },
    orderBy: { startDate: "asc" },
  });

  const items = rows.map((r) => ({
    id: r.id,
    checkIn: kstYmd(new Date(r.startDate)),
    checkOut: kstYmd(new Date(r.endDate)),
    nights: r.nights,
    guestName: r.guestName,
    guestCount: r.guestCount,
    status: r.status,
    statusLabel: r.status === "APPROVED" ? "예약확정" : "입금확인대기",
  }));

  return NextResponse.json({ ok: true, from: fromStr, to: toStr, items });
}

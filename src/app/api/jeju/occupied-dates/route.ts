import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import { eachYmdInHalfOpenRange, kstYmd } from "@/lib/dateUtils";
import { kstEndOfDay, kstMidnightFromYmd } from "@/lib/workdays";

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * - 복지부: 각 일자별로 누가 예약했는지 상세 반환
 * - 그 외: 해당 기간 중 점유 날짜 반환 (최종승인=예약됨, 그 외 진행상태=신청됨)
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  if (!fromStr || !toStr) {
    return NextResponse.json({ error: "from, to (YYYY-MM-DD) 필요" }, { status: 400 });
  }

  const from = kstMidnightFromYmd(fromStr.slice(0, 10));
  const [ty, tm, td] = toStr.slice(0, 10).split("-").map((x) => parseInt(x, 10));
  const to = kstEndOfDay(ty, tm, td);

  let blockedDates: string[] = [];
  try {
    const c = await prisma.systemConfig.findUnique({ where: { key: "jejuBlockedDates" } });
    if (c?.value) {
      const arr = JSON.parse(c.value);
      if (Array.isArray(arr)) blockedDates = arr.filter((x: unknown) => typeof x === "string");
    }
  } catch {
    // ignore
  }

  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: { team: true },
  });
  const welfare = isWelfareDept(emp);

  /* 최종승인 + 진행중 신청 모두 해당 기간 차단 (중복 신청 방지) */
  const activeRequests = await prisma.jejuAccommodation.findMany({
    where: {
      status: { in: ["APPROVED", "STEP1_APPROVED", "PENDING"] },
      startDate: { lte: to },
      endDate: { gte: from },
    },
    include: { employee: { select: { id: true, name: true, empNo: true } } },
    orderBy: { startDate: "asc" },
  });

  if (welfare) {
    const byDate: Record<string, { name: string; empNo: string; requestId: string }[]> = {};
    const welfareOccupiedSet = new Set<string>();
    const statusByDate: Record<string, "예약됨" | "신청중"> = {};
    for (const r of activeRequests) {
      const startY = kstYmd(new Date(r.startDate));
      const endY = kstYmd(new Date(r.endDate));
      for (const key of eachYmdInHalfOpenRange(startY, endY)) {
        welfareOccupiedSet.add(key);
        if (r.status === "APPROVED") statusByDate[key] = "예약됨";
        else if (!statusByDate[key]) statusByDate[key] = "신청중";
        /* 복지부 달력에는 승인된 건만 이름 표시 (PENDING은 '예약됨'으로만) */
        if (r.status !== "APPROVED") continue;
        if (!byDate[key]) byDate[key] = [];
        byDate[key].push({
          name: r.employee.name,
          empNo: r.employee.empNo,
          requestId: r.id,
        });
      }
    }
    const occupiedDates = Array.from(welfareOccupiedSet).sort();
    const inRangeBlocked = blockedDates.filter((d) => d >= fromStr && d <= toStr);
    return NextResponse.json({ welfare: true, byDate, occupiedDates, statusByDate, blockedDates: inRangeBlocked });
  }

  const occupiedDates: string[] = [];
  const statusByDate: Record<string, "예약됨" | "신청중"> = {};
  const set = new Set<string>();
  for (const d of blockedDates) {
    if (d >= fromStr && d <= toStr) {
      set.add(d);
      occupiedDates.push(d);
    }
  }
  for (const r of activeRequests) {
    const startY = kstYmd(new Date(r.startDate));
    const endY = kstYmd(new Date(r.endDate));
    for (const key of eachYmdInHalfOpenRange(startY, endY)) {
      if (!set.has(key)) {
        set.add(key);
        occupiedDates.push(key);
      }
      if (r.status === "APPROVED") statusByDate[key] = "예약됨";
      else if (!statusByDate[key]) statusByDate[key] = "신청중";
    }
  }
  occupiedDates.sort();
  const inRangeBlocked = blockedDates.filter((d) => d >= fromStr && d <= toStr);
  return NextResponse.json({ welfare: false, occupiedDates, statusByDate, blockedDates: inRangeBlocked });
}

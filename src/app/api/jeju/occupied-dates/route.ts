import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * - 복지부: 각 일자별로 누가 예약했는지 상세 반환
 * - 그 외: 해당 기간 중 "예약됨"인 날짜만 반환 (이름 없음)
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

  const from = new Date(fromStr);
  const to = new Date(toStr);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: { team: true },
  });
  const welfare = isWelfareDept(emp);

  const approved = await prisma.jejuAccommodation.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: to },
      endDate: { gte: from },
    },
    include: { employee: { select: { id: true, name: true, empNo: true } } },
    orderBy: { startDate: "asc" },
  });

  if (welfare) {
    const byDate: Record<string, { name: string; empNo: string; requestId: string }[]> = {};
    for (const r of approved) {
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        if (!byDate[key]) byDate[key] = [];
        byDate[key].push({
          name: r.employee.name,
          empNo: r.employee.empNo,
          requestId: r.id,
        });
      }
    }
    return NextResponse.json({ welfare: true, byDate });
  }

  const occupiedDates: string[] = [];
  const set = new Set<string>();
  for (const r of approved) {
    const start = new Date(r.startDate);
    const end = new Date(r.endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      if (!set.has(key)) {
        set.add(key);
        occupiedDates.push(key);
      }
    }
  }
  occupiedDates.sort();
  return NextResponse.json({ welfare: false, occupiedDates });
}

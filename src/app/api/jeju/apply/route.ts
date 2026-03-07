import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { calcNights } from "@/lib/jeju";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const body = await req.json();
  const { startDate: startStr, endDate: endStr, reason } = body as {
    startDate: string;
    endDate: string;
    reason?: string;
  };

  if (!startStr || !endStr) {
    return NextResponse.json({ error: "이용일을 선택해 주세요." }, { status: 400 });
  }

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  if (startDate > endDate) {
    return NextResponse.json({ error: "이용일이 올바르지 않습니다." }, { status: 400 });
  }

  // 일(日) 단위: 같은 날이면 1일 이용. 기간 선택이면 그 일수만큼 (nights 유지)
  const nights = startStr === endStr ? 1 : Math.max(1, calcNights(startDate, endDate));

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

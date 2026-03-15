import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";

/** 복지부 또는 PM/ADMIN: 취소 요청(CANCEL_REQUESTED) 건에 대해 취소 승인 → CANCELLED, 취소 반려 → APPROVED */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  if (user.role !== "PM" && user.role !== "ADMIN") {
    const emp = await prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { dutyDept: true },
    });
    if (!isWelfareDept(emp)) {
      return NextResponse.json({ error: "복지부 또는 관리자만 취소 승인/반려할 수 있습니다." }, { status: 403 });
    }
  }

  const body = await req.json();
  const { requestId, action } = body as { requestId: string; action: "APPROVE" | "REJECT" };

  if (!requestId || !action) {
    return NextResponse.json({ error: "requestId, action 필요" }, { status: 400 });
  }

  const row = await prisma.jejuAccommodation.findUnique({
    where: { id: requestId },
  });
  if (!row) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "CANCEL_REQUESTED") {
    return NextResponse.json({ error: "취소 요청 대기 상태가 아닙니다." }, { status: 400 });
  }

  const now = new Date();

  if (action === "APPROVE") {
    await prisma.jejuAccommodation.update({
      where: { id: requestId },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelReason: row.cancelReason ? `${row.cancelReason} (취소 승인됨)` : "취소 승인",
      },
    });
  } else {
    await prisma.jejuAccommodation.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        cancelRequestedAt: null,
        cancelReason: null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

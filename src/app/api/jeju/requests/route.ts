import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";

/** 복지부만: 전체 신청 목록 (승인 대기 포함) */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: { team: true },
  });
  if (!isWelfareDept(emp)) {
    return NextResponse.json({ error: "복지부만 조회할 수 있습니다." }, { status: 403 });
  }

  const list = await prisma.jejuAccommodation.findMany({
    where: {},
    include: { employee: { select: { id: true, name: true, empNo: true, team: true } } },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  return NextResponse.json(
    list.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      empNo: r.employee.empNo,
      teamName: r.employee.team?.name ?? null,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      nights: r.nights,
      reason: r.reason,
      status: r.status,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      rejectComment: r.rejectComment,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      cancelReason: r.cancelReason,
      createdAt: r.createdAt.toISOString(),
    }))
  );
}

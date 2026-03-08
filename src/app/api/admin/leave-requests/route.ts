import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * GET /api/admin/leave-requests?empId=&fy=&leaveTypeId=
 * PM/ADMIN: 전체 결재 내역 (필터: 사원, 귀속년도, 휴가종류)
 */
export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const empId = searchParams.get("empId") ?? "";
  const fy = searchParams.get("fy");
  const leaveTypeId = searchParams.get("leaveTypeId") ?? "";
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const where: Record<string, unknown> = {};
  if (empId) where.employeeId = empId;
  if (leaveTypeId) {
    where.items = { some: { leaveTypeId } };
  }
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    where.startDate = { lte: endDate };
    where.endDate = { gte: startDate };
    where.status = "APPROVED";
  } else if (fy) {
    const fyNum = parseInt(fy, 10);
    if (!isNaN(fyNum)) {
      const fyStart = new Date(fyNum, 4, 1);
      const fyEnd = new Date(fyNum + 1, 3, 30);
      where.startDate = { gte: fyStart };
      where.endDate = { lte: fyEnd };
    }
  }

  const list = await prisma.leaveRequest.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true, empNo: true, team: { select: { name: true } } } },
      items: { include: { leaveType: { select: { id: true, code: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(list);
}

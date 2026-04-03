import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";

/** GET /api/test/data - 테스트용 기본 데이터 조회 (admin 전용) */
export async function GET() {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const [employees, leaveTypes] = await Promise.all([
    prisma.employee.findMany({
      where: { status: { in: ["ACTIVE","INVITED"] } },
      include: { user: { select: { username: true } }, team: true },
      orderBy: { empNo: "asc" },
    }),
    prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return NextResponse.json({ employees, leaveTypes });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** GET /api/test/data - 테스트용 기본 데이터 조회 (admin 전용) */
export async function GET() {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM","ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error:"권한 없음" }, { status:403 });

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

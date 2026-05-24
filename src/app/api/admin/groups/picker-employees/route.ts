import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireSettingsAccess } from "@/lib/authGuard";
import prisma from "@/lib/db";

/** 그룹 편집용 사원 검색 목록 */
export async function GET() {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u);
  if (guard) return guard;

  const list = await prisma.employee.findMany({
    where: { status: { in: ["ACTIVE", "INVITED"] } },
    orderBy: [{ employeeType: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      empNo: true,
      employeeType: true,
      team: { select: { name: true } },
      position: true,
    },
  });
  return NextResponse.json(list);
}

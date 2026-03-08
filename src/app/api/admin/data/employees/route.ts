import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** ADMIN만. 팀장 선택 등 드롭다운용 사원 목록 (id, name, empNo) */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "ADMIN만 조회 가능합니다." }, { status: 403 });

  const list = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, empNo: true },
  });
  return NextResponse.json(list);
}

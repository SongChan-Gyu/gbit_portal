import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { audienceVisibleOrClause } from "@/lib/audienceAccess";

/** GET: 최신 공지 N개 (대시보드 등, 로그인 사용자) */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const user = session.user as { employeeId: string };
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "2", 10) || 2, 10);

  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  });
  const isExternal = emp?.employeeType === "EXTERNAL";

  const list = await prisma.notice.findMany({
    where: audienceVisibleOrClause(user.employeeId, isExternal),
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, createdAt: true },
  });
  return NextResponse.json(list);
}

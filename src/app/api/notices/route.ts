import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** GET: 최신 공지 N개 (대시보드 등, 로그인 사용자) */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "2", 10) || 2, 10);
  const list = await prisma.notice.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, createdAt: true },
  });
  return NextResponse.json(list);
}

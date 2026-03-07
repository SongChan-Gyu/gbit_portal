import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  if (!user || !["ADMIN","PM"].includes(user.role ?? "")) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page       = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const take       = 30;
  const skip       = (page - 1) * take;
  const entityType = searchParams.get("type")   ?? undefined;
  const action     = searchParams.get("action") ?? undefined;
  const keyword    = searchParams.get("q")      ?? undefined;

  const where: Record<string, unknown> = {};
  if (entityType) where.entityType = entityType;
  if (action)     where.action     = action;
  if (keyword)    where.note       = { contains: keyword };

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where: where as any }),
    prisma.auditLog.findMany({
      where: where as any,
      include: { actor: { select: { name: true, empNo: true } } },
      orderBy: { createdAt: "desc" },
      take, skip,
    }),
  ]);

  return NextResponse.json({ logs, total, page, totalPages: Math.ceil(total / take) });
}

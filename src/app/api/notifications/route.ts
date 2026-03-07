import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

// GET /api/notifications?limit=20&unreadOnly=true
export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.employeeId)
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  const notifications = await prisma.notification.findMany({
    where: {
      employeeId: user.employeeId,
      ...(unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const unreadCount = await prisma.notification.count({
    where: { employeeId: user.employeeId, isRead: false },
  });

  return NextResponse.json({ notifications, unreadCount });
}

// PATCH /api/notifications  { ids?: string[], all?: true }
export async function PATCH(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.employeeId)
    return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { ids, all } = await req.json();

  if (all) {
    await prisma.notification.updateMany({
      where: { employeeId: user.employeeId, isRead: false },
      data: { isRead: true },
    });
  } else if (Array.isArray(ids) && ids.length > 0) {
    await prisma.notification.updateMany({
      where: { employeeId: user.employeeId, id: { in: ids } },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}

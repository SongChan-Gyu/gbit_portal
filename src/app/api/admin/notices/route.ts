import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";

/** GET: 공지 목록 (최신순) */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const list = await prisma.notice.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json(list);
}

/** POST: 공지 등록 (PM/ADMIN만) */
export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u); if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const { title, content } = body;
  if (!title || typeof content !== "string")
    return NextResponse.json({ error: "제목과 내용은 필수입니다." }, { status: 400 });

  const notice = await prisma.notice.create({
    data: {
      title: String(title).trim(),
      content: content,
      authorId: u.employeeId,
    },
    include: { author: { select: { name: true } } },
  });
  await writeAudit({
    entityType: "Notice",
    entityId: notice.id,
    action: "CREATED",
    actorId: u?.employeeId ?? null,
    after: { title: notice.title },
    ip: getIp(req) ?? undefined,
  });
  return NextResponse.json(notice);
}

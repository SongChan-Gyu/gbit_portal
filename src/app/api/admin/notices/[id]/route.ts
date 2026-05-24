import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const { id } = await ctx.params;
  const notice = await prisma.notice.findUnique({
    where: { id },
    include: { author: { select: { name: true } } },
  });
  if (!notice) return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(notice);
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u); if (guard) return guard;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { title, content, audience, employeeGroupId } = body;
  if (!title || typeof content !== "string")
    return NextResponse.json({ error: "제목과 내용은 필수입니다." }, { status: 400 });

  const aud = audience != null ? String(audience) : undefined;
  let gid: string | null | undefined = undefined;
  if (aud === "GROUP") {
    gid = employeeGroupId ? String(employeeGroupId) : null;
    if (!gid) return NextResponse.json({ error: "지정 그룹을 선택하세요." }, { status: 400 });
  } else if (aud != null) {
    gid = null;
  }

  const before = await prisma.notice.findUnique({ where: { id }, select: { title: true } });
  const notice = await prisma.notice.update({
    where: { id },
    data: {
      title: String(title).trim(),
      content,
      ...(aud != null ? { audience: aud } : {}),
      ...(gid !== undefined ? { employeeGroupId: gid } : {}),
    },
    include: { author: { select: { name: true } } },
  });
  await writeAudit({
    entityType: "Notice",
    entityId: id,
    action: "UPDATED",
    actorId: u?.employeeId ?? null,
    before: before ?? undefined,
    after: { title: notice.title },
    ip: getIp(req) ?? undefined,
  });
  return NextResponse.json(notice);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u); if (guard) return guard;
  const { id } = await ctx.params;
  const notice = await prisma.notice.findUnique({ where: { id }, select: { title: true } });
  await prisma.notice.delete({ where: { id } }).catch(() => null);
  if (notice) {
    await writeAudit({
      entityType: "Notice",
      entityId: id,
      action: "DELETED",
      actorId: u?.employeeId ?? null,
      before: notice,
      ip: getIp(req) ?? undefined,
    });
  }
  return NextResponse.json({ ok: true });
}

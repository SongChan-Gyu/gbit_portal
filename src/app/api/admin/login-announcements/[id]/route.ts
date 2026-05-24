import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";
import type { AudienceCode } from "@/lib/audienceAccess";

function parseAudience(v: unknown): AudienceCode {
  const s = String(v ?? "INTERNAL");
  if (s === "ALL" || s === "INTERNAL" || s === "EXTERNAL" || s === "GROUP") return s;
  return "INTERNAL";
}

function parseOptionalDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u);
  if (guard) return guard;

  const { id } = await ctx.params;
  const row = await prisma.loginAnnouncement.findUnique({
    where: { id },
    include: {
      author: { select: { name: true } },
      employeeGroup: { select: { id: true, name: true } },
      notice: { select: { id: true, title: true } },
    },
  });
  if (!row) return NextResponse.json({ error: "팝업을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(row);
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u);
  if (guard) return guard;

  const { id } = await ctx.params;
  const existing = await prisma.loginAnnouncement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "팝업을 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? existing.title).trim();
  const textBody = String(body.body ?? existing.body).trim();
  if (!title || !textBody) {
    return NextResponse.json({ error: "제목과 본문은 필수입니다." }, { status: 400 });
  }

  const audience = parseAudience(body.audience ?? existing.audience);
  let employeeGroupId: string | null =
    audience === "GROUP"
      ? body.employeeGroupId != null
        ? String(body.employeeGroupId) || null
        : existing.employeeGroupId
      : null;
  if (audience === "GROUP" && !employeeGroupId) {
    return NextResponse.json({ error: "지정 그룹을 선택하세요." }, { status: 400 });
  }

  const detailMode = (body.detailMode ?? existing.detailMode) === "NOTICE" ? "NOTICE" : "NONE";
  let noticeId: string | null =
    detailMode === "NOTICE"
      ? body.noticeId != null
        ? String(body.noticeId) || null
        : existing.noticeId
      : null;
  if (detailMode === "NOTICE" && !noticeId) {
    return NextResponse.json({ error: "연결할 공지를 선택하세요." }, { status: 400 });
  }

  const row = await prisma.loginAnnouncement.update({
    where: { id },
    data: {
      title: title.slice(0, 200),
      body: textBody.slice(0, 5000),
      audience,
      employeeGroupId,
      startsAt: body.startsAt !== undefined ? parseOptionalDate(body.startsAt) : existing.startsAt,
      endsAt: body.endsAt !== undefined ? parseOptionalDate(body.endsAt) : existing.endsAt,
      priority: body.priority !== undefined ? Number(body.priority) || 0 : existing.priority,
      detailMode,
      noticeId,
      isActive: body.isActive !== undefined ? !!body.isActive : existing.isActive,
    },
  });

  await writeAudit({
    entityType: "LoginAnnouncement",
    entityId: id,
    action: "UPDATED",
    actorId: u?.employeeId ?? null,
    after: { title: row.title },
    ip: getIp(req) ?? undefined,
  });

  return NextResponse.json(row);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u);
  if (guard) return guard;

  const { id } = await ctx.params;
  const existing = await prisma.loginAnnouncement.findUnique({ where: { id }, select: { title: true } });
  if (existing) {
    await prisma.loginAnnouncement.delete({ where: { id } });
    await writeAudit({
      entityType: "LoginAnnouncement",
      entityId: id,
      action: "DELETED",
      actorId: u?.employeeId ?? null,
      before: existing,
      ip: getIp(req) ?? undefined,
    });
  }
  return NextResponse.json({ ok: true });
}

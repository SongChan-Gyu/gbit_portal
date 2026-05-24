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

export async function GET() {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u);
  if (guard) return guard;

  const list = await prisma.loginAnnouncement.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: {
      author: { select: { name: true } },
      employeeGroup: { select: { name: true } },
      notice: { select: { id: true, title: true } },
    },
  });
  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const textBody = String(body.body ?? "").trim();
  if (!title || !textBody) {
    return NextResponse.json({ error: "제목과 본문은 필수입니다." }, { status: 400 });
  }

  const audience = parseAudience(body.audience);
  let employeeGroupId: string | null =
    audience === "GROUP" && body.employeeGroupId ? String(body.employeeGroupId) : null;
  if (audience === "GROUP" && !employeeGroupId) {
    return NextResponse.json({ error: "지정 그룹을 선택하세요." }, { status: 400 });
  }

  const detailMode = body.detailMode === "NOTICE" ? "NOTICE" : "NONE";
  let noticeId: string | null = detailMode === "NOTICE" && body.noticeId ? String(body.noticeId) : null;
  if (detailMode === "NOTICE" && !noticeId) {
    return NextResponse.json({ error: "연결할 공지를 선택하세요." }, { status: 400 });
  }

  const row = await prisma.loginAnnouncement.create({
    data: {
      title: title.slice(0, 200),
      body: textBody.slice(0, 5000),
      audience,
      employeeGroupId,
      startsAt: parseOptionalDate(body.startsAt),
      endsAt: parseOptionalDate(body.endsAt),
      priority: Number(body.priority) || 0,
      detailMode,
      noticeId,
      isActive: body.isActive !== false,
      authorId: u.employeeId,
    },
  });

  await writeAudit({
    entityType: "LoginAnnouncement",
    entityId: row.id,
    action: "CREATED",
    actorId: u?.employeeId ?? null,
    after: { title: row.title },
    ip: getIp(req) ?? undefined,
  });

  return NextResponse.json(row);
}

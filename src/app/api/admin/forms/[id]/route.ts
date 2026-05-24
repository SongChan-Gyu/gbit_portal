import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requireSettingsAccess } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";
import { parseFormSubmitDeadlineInput } from "@/lib/formSubmitDeadline";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u); if (guard) return guard;
  const { id } = await ctx.params;
  const form = await prisma.form.findUnique({
    where: { id },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form) return NextResponse.json({ error: "폼을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(form);
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u); if (guard) return guard;
  const { id } = await ctx.params;
  const form = await prisma.form.findUnique({ where: { id } });
  if (!form) return NextResponse.json({ error: "폼을 찾을 수 없습니다." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const { title, slug, description, isActive, fields, showInMenu, audience, targetGroupId, isAnonymous, submitDeadline } = body;
  const slugRaw = slug != null ? String(slug).trim().replace(/\s+/g, "-").toLowerCase() : undefined;
  const slugNorm = slugRaw || null; // 빈 문자열 → null (공개 링크 없음)
  if (slugNorm && !/^[a-z0-9-]+$/.test(slugNorm))
    return NextResponse.json({ error: "URL 경로는 영문 소문자, 숫자, 하이픈만 가능합니다." }, { status: 400 });
  if (slugNorm && slugNorm !== form.slug) {
    const existing = await prisma.form.findUnique({ where: { slug: slugNorm } });
    if (existing) return NextResponse.json({ error: "이미 사용 중인 URL 경로입니다." }, { status: 400 });
  }
  const before = form ? { title: form.title, slug: form.slug } : undefined;

  let audienceData: { audience?: string; employeeGroupId?: string | null } = {};
  if (audience != null) {
    const aud = String(audience);
    if (aud === "GROUP") {
      const gid = targetGroupId != null ? String(targetGroupId) : null;
      if (!gid)
        return NextResponse.json({ error: "대상 그룹을 선택해 주세요." }, { status: 400 });
      audienceData = { audience: aud, employeeGroupId: gid };
    } else {
      audienceData = { audience: aud, employeeGroupId: null };
    }
  } else if (targetGroupId !== undefined) {
    if (form.audience === "GROUP") {
      const gid = targetGroupId != null ? String(targetGroupId) : null;
      if (!gid)
        return NextResponse.json({ error: "대상 그룹을 선택해 주세요." }, { status: 400 });
      audienceData = { employeeGroupId: gid };
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.formField.deleteMany({ where: { formId: id } });
    await tx.form.update({
      where: { id },
      data: {
        ...(title != null && { title }),
        ...(slug !== undefined && { slug: slugNorm }),
        ...(description !== undefined && { description: description || null }),
        ...(isActive !== undefined && { isActive: !!isActive }),
        ...(showInMenu !== undefined && { showInMenu: !!showInMenu }),
        ...audienceData,
        ...(isAnonymous !== undefined && { isAnonymous: !!isAnonymous }),
        ...(submitDeadline !== undefined && {
          submitDeadline: parseFormSubmitDeadlineInput(submitDeadline),
        }),
        fields: {
          create: (Array.isArray(fields) ? fields : []).map(
            (f: { label: string; fieldType?: string; options?: string[]; required?: boolean }, i: number) => ({
              sortOrder: i,
              label: f.label ?? "",
              fieldType: (["text","textarea","number","date","select","radio","checkbox"] as string[]).includes(f.fieldType ?? "") ? f.fieldType! : "text",
              options: (["select","radio","checkbox"] as string[]).includes(f.fieldType ?? "") && Array.isArray(f.options) ? JSON.stringify(f.options) : null,
              required: !!f.required,
            })
          ),
        },
      },
    });
  });
  await writeAudit({
    entityType: "Form",
    entityId: id,
    action: "UPDATED",
    actorId: u?.employeeId ?? null,
    before,
    after: { title: title ?? form?.title, slug: slugNorm ?? form?.slug },
    ip: getIp(req) ?? undefined,
  });
  const updated = await prisma.form.findUnique({
    where: { id },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u); if (guard) return guard;
  const { id } = await ctx.params;
  const form = await prisma.form.findUnique({ where: { id }, select: { title: true, slug: true } });
  await prisma.form.delete({ where: { id } }).catch(() => null);
  if (form) {
    await writeAudit({
      entityType: "Form",
      entityId: id,
      action: "DELETED",
      actorId: u?.employeeId ?? null,
      before: form,
      ip: getIp(req) ?? undefined,
    });
  }
  return NextResponse.json({ ok: true });
}

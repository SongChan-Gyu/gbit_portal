import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM", "ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
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
  if (!["PM", "ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const { id } = await ctx.params;
  const form = await prisma.form.findUnique({ where: { id } });
  if (!form) return NextResponse.json({ error: "폼을 찾을 수 없습니다." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const { title, slug, description, isActive, fields } = body;
  const slugNorm = slug != null ? String(slug).trim().replace(/\s+/g, "-").toLowerCase() : form.slug;
  if (slugNorm && !/^[a-z0-9-]+$/.test(slugNorm))
    return NextResponse.json({ error: "URL 경로는 영문 소문자, 숫자, 하이픈만 가능합니다." }, { status: 400 });
  if (slugNorm && slugNorm !== form.slug) {
    const existing = await prisma.form.findUnique({ where: { slug: slugNorm } });
    if (existing) return NextResponse.json({ error: "이미 사용 중인 URL 경로입니다." }, { status: 400 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.formField.deleteMany({ where: { formId: id } });
    await tx.form.update({
      where: { id },
      data: {
        ...(title != null && { title }),
        ...(slug != null && { slug: slugNorm }),
        ...(description !== undefined && { description: description || null }),
        ...(isActive !== undefined && { isActive: !!isActive }),
        fields: {
          create: (Array.isArray(fields) ? fields : []).map(
            (f: { label: string; fieldType?: string; options?: string[]; required?: boolean }, i: number) => ({
              sortOrder: i,
              label: f.label ?? "",
              fieldType: f.fieldType === "select" ? "select" : "text",
              options: f.fieldType === "select" && Array.isArray(f.options) ? JSON.stringify(f.options) : null,
              required: !!f.required,
            })
          ),
        },
      },
    });
  });
  const updated = await prisma.form.findUnique({
    where: { id },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM", "ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const { id } = await ctx.params;
  await prisma.form.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

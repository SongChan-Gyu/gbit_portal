import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/** GET: 폼 조회 (slug 또는 id) - 공개 가능 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const isCuid = /^c[a-z0-9]{20,}$/.test(slug);
  const form = await prisma.form.findFirst({
    where: isCuid ? { id: slug, isActive: true } : { slug, isActive: true },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form)
    return NextResponse.json({ error: "폼을 찾을 수 없거나 비활성화되었습니다." }, { status: 404 });

  const fields = form.fields.map((f) => ({
    id: f.id,
    label: f.label,
    fieldType: f.fieldType,
    options: f.options ? (JSON.parse(f.options) as string[]) : null,
    required: f.required,
  }));

  return NextResponse.json({
    id: form.id,
    title: form.title,
    slug: form.slug,
    description: form.description,
    fields,
  });
}

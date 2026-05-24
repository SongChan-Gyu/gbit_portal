import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { employeeCanAccessForm } from "@/lib/formAccess";

/** GET: 폼 조회 (slug 또는 id) — 대상(내부/외부/그룹)에 맞는 사용자만 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const isCuid = /^c[a-z0-9]{20,}$/.test(slug);
  const form = await prisma.form.findFirst({
    where: isCuid ? { id: slug, isActive: true } : { slug, isActive: true },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form)
    return NextResponse.json({ error: "폼을 찾을 수 없거나 비활성화되었습니다." }, { status: 404 });

  const baseSlice = {
    id: form.id,
    audience: form.audience,
    targetGroupId: form.employeeGroupId,
  };

  if (form.audience !== "ALL") {
    const session = await auth();
    const employeeId = (session?.user as { employeeId?: string })?.employeeId ?? null;
    const emp = employeeId
      ? await prisma.employee.findUnique({
          where: { id: employeeId },
          select: { employeeType: true },
        })
      : null;
    const ok = await employeeCanAccessForm(prisma, employeeId, emp?.employeeType, baseSlice);
    if (!ok) {
      return NextResponse.json(
        { error: "이 양식을 볼 권한이 없습니다. 로그인 후 다시 시도해 주세요." },
        { status: 403 },
      );
    }
  }

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
    isAnonymous: form.isAnonymous,
    fields,
  });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requireSettingsAccess } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";
import { parseFormSubmitDeadlineInput } from "@/lib/formSubmitDeadline";
import { formFieldUsesOptions, isFormFieldType } from "@/lib/formFieldTypes";

/** GET: 폼 목록 */
export async function GET() {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u); if (guard) return guard;

  const list = await prisma.form.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { submissions: true } },
      fields: { orderBy: { sortOrder: "asc" } },
    },
  });
  return NextResponse.json(list);
}

/** POST: 폼 생성 (필드 포함) */
export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u); if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const { title, slug, description, isActive, fields, showInMenu, audience, targetGroupId, isAnonymous, submitDeadline } = body;
  if (!title)
    return NextResponse.json({ error: "제목은 필수입니다." }, { status: 400 });

  const aud = String(audience ?? "ALL");
  let tgid: string | null = null;
  if (aud === "GROUP") {
    tgid = targetGroupId ? String(targetGroupId) : null;
    if (!tgid)
      return NextResponse.json({ error: "대상 그룹을 선택해 주세요." }, { status: 400 });
  }

  const slugRaw = slug ? String(slug).trim().replace(/\s+/g, "-").toLowerCase() : null;
  if (slugRaw && !/^[a-z0-9-]+$/.test(slugRaw))
    return NextResponse.json({ error: "URL 경로는 영문 소문자, 숫자, 하이픈만 가능합니다." }, { status: 400 });

  if (slugRaw) {
    const existing = await prisma.form.findUnique({ where: { slug: slugRaw } });
    if (existing)
      return NextResponse.json({ error: "이미 사용 중인 URL 경로입니다." }, { status: 400 });
  }

  const form = await prisma.form.create({
    data: {
      title,
      slug: slugRaw,
      description: description ?? null,
      isActive: isActive !== false,
      showInMenu: !!showInMenu,
      audience: aud,
      employeeGroupId: tgid,
      isAnonymous: !!isAnonymous,
      submitDeadline: parseFormSubmitDeadlineInput(submitDeadline),
      fields: {
        create: (Array.isArray(fields) ? fields : []).map((f: { label: string; fieldType?: string; options?: string[]; required?: boolean }, i: number) => ({
          sortOrder: i,
          label: f.label ?? "",
          fieldType: isFormFieldType(f.fieldType ?? "") ? f.fieldType! : "text",
          options: formFieldUsesOptions(f.fieldType ?? "") && Array.isArray(f.options) ? JSON.stringify(f.options) : null,
          required: !!f.required,
        })),
      },
    },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  await writeAudit({
    entityType: "Form",
    entityId: form.id,
    action: "CREATED",
    actorId: u?.employeeId ?? null,
    after: { title: form.title, slug: form.slug },
    ip: getIp(req) ?? undefined,
  });
  return NextResponse.json(form);
}

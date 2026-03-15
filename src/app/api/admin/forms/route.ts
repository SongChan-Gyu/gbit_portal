import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** GET: 폼 목록 */
export async function GET() {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM", "ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

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
  if (!["PM", "ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { title, slug, description, isActive, fields } = body;
  if (!title || !slug)
    return NextResponse.json({ error: "제목과 URL 경로(slug)는 필수입니다." }, { status: 400 });

  const slugNorm = String(slug).trim().replace(/\s+/g, "-").toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slugNorm))
    return NextResponse.json({ error: "URL 경로는 영문 소문자, 숫자, 하이픈만 가능합니다." }, { status: 400 });

  const existing = await prisma.form.findUnique({ where: { slug: slugNorm } });
  if (existing)
    return NextResponse.json({ error: "이미 사용 중인 URL 경로입니다." }, { status: 400 });

  const form = await prisma.form.create({
    data: {
      title,
      slug: slugNorm,
      description: description ?? null,
      isActive: isActive !== false,
      fields: {
        create: (Array.isArray(fields) ? fields : []).map((f: { label: string; fieldType?: string; options?: string[]; required?: boolean }, i: number) => ({
          sortOrder: i,
          label: f.label ?? "",
          fieldType: f.fieldType === "select" ? "select" : "text",
          options: f.fieldType === "select" && Array.isArray(f.options) ? JSON.stringify(f.options) : null,
          required: !!f.required,
        })),
      },
    },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json(form);
}

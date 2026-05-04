import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** POST: 폼 제출 (ID 또는 slug로 조회, 로그인 사용자 자동 연동) */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  // slug가 cuid 형식이면 id로 조회, 아니면 slug로 조회
  const isCuid = /^c[a-z0-9]{20,}$/.test(slug);
  const form = await prisma.form.findFirst({
    where: isCuid
      ? { id: slug, isActive: true }
      : { slug, isActive: true },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form)
    return NextResponse.json({ error: "폼을 찾을 수 없거나 비활성화되었습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { submitterName, submitterEmail, submitterPhone, answers } = body;

  // 로그인 세션에서 이름 자동 취득
  const session = await auth();
  const sessionUser = session?.user as any;
  const resolvedName = String(submitterName ?? sessionUser?.name ?? "").trim();
  const resolvedEmployeeId: string | null = sessionUser?.employeeId ?? null;

  const fieldIds = new Set(form.fields.map((f) => f.id));
  const answerMap = typeof answers === "object" && answers !== null ? answers : {};
  const requiredMissing = form.fields.filter((f) => f.required && !String(answerMap[f.id] ?? "").trim());
  if (requiredMissing.length > 0)
    return NextResponse.json(
      { error: `필수 항목을 입력해 주세요: ${requiredMissing.map((f) => f.label).join(", ")}` },
      { status: 400 }
    );

  const submission = await prisma.formSubmission.create({
    data: {
      formId: form.id,
      submitterName: resolvedName,
      submitterEmail: submitterEmail ? String(submitterEmail).trim() : null,
      submitterPhone: submitterPhone ? String(submitterPhone).trim() : null,
      employeeId: resolvedEmployeeId,
      answers: {
        create: form.fields.map((f) => {
          const val = fieldIds.has(f.id) ? String(answerMap[f.id] ?? "").trim() : "";
          return { formFieldId: f.id, value: val };
        }),
      },
    },
  });

  return NextResponse.json({ ok: true, id: submission.id });
}

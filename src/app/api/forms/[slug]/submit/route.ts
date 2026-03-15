import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/** POST: 공개 폼 제출 (비회원 가능, 본인 이름 필수) */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const form = await prisma.form.findUnique({
    where: { slug, isActive: true },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form)
    return NextResponse.json({ error: "폼을 찾을 수 없거나 비활성화되었습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { submitterName, submitterEmail, submitterPhone, answers } = body;

  const name = String(submitterName ?? "").trim();
  if (!name) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });

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
      submitterName: name,
      submitterEmail: submitterEmail ? String(submitterEmail).trim() : null,
      submitterPhone: submitterPhone ? String(submitterPhone).trim() : null,
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

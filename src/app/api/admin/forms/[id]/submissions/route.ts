import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requireSettingsAccess } from "@/lib/authGuard";
import prisma from "@/lib/db";

/**
 * GET: 해당 폼의 제출 목록 (각 제출별로 필드값을 키-값으로 펼쳐서 반환)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u); if (guard) return guard;

  const { id: formId } = await params;
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form) return NextResponse.json({ error: "폼을 찾을 수 없습니다." }, { status: 404 });

  const submissions = await prisma.formSubmission.findMany({
    where: { formId },
    orderBy: { createdAt: "desc" },
    include: {
      answers: { include: { formField: true } },
    },
  });

  const fieldIds = form.fields.map((f) => f.id);
  const rows = submissions.map((s) => {
    const byField: Record<string, string> = {};
    s.answers.forEach((a) => {
      byField[a.formField.id] = a.value;
    });
    return {
      id: s.id,
      submitterName: s.submitterName,
      submitterEmail: s.submitterEmail ?? "",
      submitterPhone: s.submitterPhone ?? "",
      createdAt: s.createdAt.toISOString(),
      answers: byField,
      // 테이블 헤더용: 필드 라벨 -> 값
      labelValues: form.fields.reduce((acc, f) => {
        acc[f.label] = byField[f.id] ?? "";
        return acc;
      }, {} as Record<string, string>),
    };
  });

  return NextResponse.json({
    form: { id: form.id, title: form.title, slug: form.slug },
    fields: form.fields.map((f) => ({ id: f.id, label: f.label, fieldType: f.fieldType })),
    rows,
  });
}

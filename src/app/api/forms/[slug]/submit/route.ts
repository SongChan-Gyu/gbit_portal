import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { employeeCanAccessForm } from "@/lib/formAccess";

function resolveFormWhere(slug: string) {
  const isCuid = /^c[a-z0-9]{20,}$/.test(slug);
  return isCuid ? { id: slug, isActive: true } : { slug, isActive: true };
}

/**
 * GET: 현재 로그인 사용자의 이 양식 최근 제출 조회
 * 미로그인 또는 제출 없으면 { submitted: false }
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const session = await auth();
  const employeeId = (session?.user as any)?.employeeId ?? null;
  if (!employeeId) return NextResponse.json({ submitted: false });

  const form = await prisma.form.findFirst({
    where: resolveFormWhere(slug),
    select: {
      id: true,
      audience: true,
      targetGroupId: true,
      fields: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true } },
    },
  });
  if (!form) return NextResponse.json({ submitted: false });

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { employeeType: true },
  });
  const can = await employeeCanAccessForm(prisma, employeeId, emp?.employeeType, {
    id: form.id,
    audience: form.audience,
    targetGroupId: form.targetGroupId,
  });
  if (!can) return NextResponse.json({ submitted: false });

  const existing = await prisma.formSubmission.findFirst({
    where: { formId: form.id, employeeId },
    orderBy: { createdAt: "desc" },
    include: { answers: { select: { formFieldId: true, value: true } } },
  });
  if (!existing) return NextResponse.json({ submitted: false });

  const answerMap: Record<string, string> = {};
  for (const a of existing.answers) answerMap[a.formFieldId] = a.value;

  return NextResponse.json({
    submitted: true,
    submittedAt: existing.createdAt.toISOString(),
    answers: answerMap,
  });
}

/**
 * POST: 폼 제출 (로그인 사용자는 기존 제출 덮어쓰기)
 * - employeeId가 있고 기존 제출이 있으면 삭제 후 재생성 (최신 1건 유지)
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const form = await prisma.form.findFirst({
    where: resolveFormWhere(slug),
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form)
    return NextResponse.json({ error: "폼을 찾을 수 없거나 비활성화되었습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { submitterName, submitterEmail, submitterPhone, answers } = body;

  const session = await auth();
  const sessionUser = session?.user as any;
  const resolvedEmployeeId: string | null = sessionUser?.employeeId ?? null;
  const empRow = resolvedEmployeeId
    ? await prisma.employee.findUnique({
        where: { id: resolvedEmployeeId },
        select: { employeeType: true, name: true },
      })
    : null;

  const access = await employeeCanAccessForm(prisma, resolvedEmployeeId, empRow?.employeeType, {
    id: form.id,
    audience: form.audience,
    targetGroupId: form.targetGroupId,
  });
  if (!access) {
    return NextResponse.json({ error: "이 양식에 제출할 권한이 없습니다." }, { status: 403 });
  }

  if (form.audience !== "ALL" && !resolvedEmployeeId) {
    return NextResponse.json({ error: "로그인 후 제출해 주세요." }, { status: 401 });
  }

  let resolvedName = String(submitterName ?? sessionUser?.name ?? empRow?.name ?? "").trim();
  if (form.isAnonymous) {
    resolvedName = "익명";
  }

  const fieldIds = new Set(form.fields.map((f) => f.id));
  const answerMap = typeof answers === "object" && answers !== null ? answers : {};
  const requiredMissing = form.fields.filter((f) => f.required && !String(answerMap[f.id] ?? "").trim());
  if (requiredMissing.length > 0)
    return NextResponse.json(
      { error: `필수 항목을 입력해 주세요: ${requiredMissing.map((f) => f.label).join(", ")}` },
      { status: 400 },
    );

  // 로그인 사용자의 기존 제출 삭제 (cascade로 answers 함께 삭제)
  if (resolvedEmployeeId) {
    await prisma.formSubmission.deleteMany({
      where: { formId: form.id, employeeId: resolvedEmployeeId },
    });
  }

  const emailVal = submitterEmail ? String(submitterEmail).trim() : null;
  const phoneVal = submitterPhone ? String(submitterPhone).trim() : null;

  const submission = await prisma.formSubmission.create({
    data: {
      formId: form.id,
      submitterName: resolvedName,
      submitterEmail: form.isAnonymous ? null : emailVal,
      submitterPhone: form.isAnonymous ? null : phoneVal,
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

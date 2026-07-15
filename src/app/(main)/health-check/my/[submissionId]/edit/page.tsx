import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import FormSubmitClient from "@/app/(main)/forms/[id]/FormSubmitClient";
import { allowsMultipleSubmissions } from "@/lib/formSubmissionPolicy";
import { checkHealthCheckEligibility, HEALTH_CHECK_FORM_SLUG } from "@/lib/healthCheck";

export const metadata = { title: "건강검진 신청 수정 | GBIT Portal" };

export default async function HealthCheckEditPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as { employeeId?: string };
  if (!user.employeeId) redirect("/health-check");

  const { submissionId } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true, birthDate: true },
  });

  const submission = await prisma.formSubmission.findFirst({
    where: { id: submissionId, employeeId: user.employeeId },
    include: {
      answers: { select: { formFieldId: true, value: true } },
      form: {
        include: { fields: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  if (!submission?.form.isActive || submission.form.slug !== HEALTH_CHECK_FORM_SLUG) {
    notFound();
  }

  const form = submission.form;
  const eligibility = checkHealthCheckEligibility(employee, form);
  if (!eligibility.ok) {
    return (
      <div className="space-y-4">
        <Link href="/health-check/my" className="text-sm text-gray-500 hover:text-gray-700">
          ← 내 신청 내역
        </Link>
        <div className="max-w-xl rounded-2xl bg-white border border-amber-200 shadow-sm p-6">
          <h1 className="text-[17px] font-bold text-gray-900 mb-2">{form.title} · 수정</h1>
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
            {eligibility.reason}
          </div>
        </div>
      </div>
    );
  }

  const fields = form.fields.map((f) => ({
    id: f.id,
    label: f.label,
    fieldType: f.fieldType,
    options: f.options ? (JSON.parse(f.options) as string[]) : null,
    required: f.required,
  }));

  const prevSubmission = {
    submitted: true as const,
    submittedAt: submission.createdAt.toISOString(),
    answers: Object.fromEntries(submission.answers.map((a) => [a.formFieldId, a.value])),
  };

  return (
    <div className="space-y-4">
      <Link href="/health-check/my" className="text-sm text-gray-500 hover:text-gray-700">
        ← 내 신청 내역
      </Link>
      <FormSubmitClient
        form={{
          id: form.id,
          title: form.title,
          description: form.description ?? null,
          fields,
          isAnonymous: form.isAnonymous,
        }}
        prevSubmission={prevSubmission}
        allowMultipleSubmissions={allowsMultipleSubmissions(form)}
        afterSubmitHref="/health-check/my"
        editingSubmissionId={submissionId}
      />
    </div>
  );
}

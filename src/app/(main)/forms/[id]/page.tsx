import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import FormSubmitClient from "./FormSubmitClient";
import { employeeCanAccessForm } from "@/lib/formAccess";
import { allowsMultipleSubmissions } from "@/lib/formSubmissionPolicy";
import { checkHealthCheckEligibility, HEALTH_CHECK_FORM_SLUG } from "@/lib/healthCheck";

export default async function InternalFormPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const form = await prisma.form.findUnique({
    where: { id, isActive: true },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form) notFound();

  const user = session.user as any;
  const employee = user.employeeId
    ? await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: { employeeType: true, birthDate: true, name: true },
      })
    : null;

  const can = await employeeCanAccessForm(prisma, user.employeeId ?? null, employee?.employeeType, {
    id: form.id,
    audience: form.audience,
    targetGroupId: form.employeeGroupId,
  });
  if (!can) notFound();

  const fields = form.fields.map((f) => ({
    id: f.id,
    label: f.label,
    fieldType: f.fieldType,
    options: f.options ? (JSON.parse(f.options) as string[]) : null,
    required: f.required,
  }));

  const isHealthCheckForm = form.slug === HEALTH_CHECK_FORM_SLUG;
  const allowMultiple =
    allowsMultipleSubmissions(form) ||
    (isHealthCheckForm && employee?.employeeType !== "EXTERNAL");
  const healthCheckEligibility = isHealthCheckForm ? checkHealthCheckEligibility(employee, form) : null;

  if (healthCheckEligibility && !healthCheckEligibility.ok) {
    return (
      <div className="py-2">
        <div className="max-w-xl mx-auto rounded-2xl bg-white border border-amber-200 shadow-sm p-6">
          <h1 className="text-[17px] font-bold text-gray-900 mb-2">{form.title}</h1>
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
            {healthCheckEligibility.reason}
          </div>
        </div>
      </div>
    );
  }

  // 기존 제출 이력 조회 (다건 제출 양식은 매번 새로 작성)
  const prevSub =
    !allowMultiple && user.employeeId
      ? await prisma.formSubmission.findFirst({
          where: { formId: form.id, employeeId: user.employeeId },
          orderBy: { createdAt: "desc" },
          include: { answers: { select: { formFieldId: true, value: true } } },
        })
      : null;

  const prevSubmission = prevSub
    ? {
        submitted: true as const,
        submittedAt: prevSub.createdAt.toISOString(),
        answers: Object.fromEntries(prevSub.answers.map((a) => [a.formFieldId, a.value])),
      }
    : { submitted: false as const };

  return (
    <div className="py-2">
      <FormSubmitClient
        form={{
          id: form.id,
          title: form.title,
          description: form.description ?? null,
          fields,
          isAnonymous: form.isAnonymous,
        }}
        prevSubmission={prevSubmission}
        allowMultipleSubmissions={allowMultiple}
        afterSubmitHref={isHealthCheckForm ? "/health-check/my" : allowMultiple ? "/health-check/my" : undefined}
      />
    </div>
  );
}

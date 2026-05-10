import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import FormSubmitClient from "./FormSubmitClient";

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
    ? await prisma.employee.findUnique({ where: { id: user.employeeId }, select: { employeeType: true } })
    : null;
  const isExternal = employee?.employeeType === "EXTERNAL";

  // audience 체크
  if (form.audience === "EXTERNAL" && !isExternal) notFound();
  if (form.audience === "INTERNAL" && isExternal) notFound();

  const fields = form.fields.map((f) => ({
    id: f.id,
    label: f.label,
    fieldType: f.fieldType,
    options: f.options ? (JSON.parse(f.options) as string[]) : null,
    required: f.required,
  }));

  // 기존 제출 이력 조회
  const prevSub = user.employeeId
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
        }}
        prevSubmission={prevSubmission}
      />
    </div>
  );
}

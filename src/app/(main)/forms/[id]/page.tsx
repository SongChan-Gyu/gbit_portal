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

  return (
    <div className="py-2">
      <FormSubmitClient
        form={{
          id: form.id,
          title: form.title,
          description: form.description ?? null,
          fields,
        }}
      />
    </div>
  );
}

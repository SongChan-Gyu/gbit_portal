import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import FormBuilder, { type FormFieldDef } from "../../FormBuilder";

export const metadata = { title: "양식 수정 | GBIT Portal" };

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? "") && !user?.isSettingsAdmin) redirect("/dashboard");

  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form) redirect("/admin/forms");

  const initial = {
    title: form.title,
    slug: form.slug ?? "",
    description: form.description ?? "",
    isActive: form.isActive,
    showInMenu: form.showInMenu,
    audience: (form.audience ?? "ALL") as "ALL" | "INTERNAL" | "EXTERNAL" | "GROUP",
    targetGroupId: form.targetGroupId ?? null,
    isAnonymous: form.isAnonymous ?? false,
    fields: form.fields.map((f) => ({
      id: f.id,
      label: f.label,
      fieldType: f.fieldType as FormFieldDef["fieldType"],
      options: f.options ? (JSON.parse(f.options) as string[]) : undefined,
      required: f.required,
    })),
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/admin/forms" className="text-sm text-gray-500 hover:text-gray-700">
          ← 양식 관리
        </Link>
        <h1 className="page-title mt-2">양식 수정</h1>
        <p className="text-sm text-gray-500 mt-0.5">{form.title}{form.slug ? ` · /f/${form.slug}` : ""}</p>
      </div>
      <FormBuilder formId={id} initial={initial} />
    </div>
  );
}

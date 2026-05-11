import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import SubmissionsTable from "./SubmissionsTable";

export const metadata = { title: "제출 목록 | GBIT Portal" };

export default async function FormSubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? "")) redirect("/dashboard");

  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form) redirect("/admin/forms");

  const submissions = await prisma.formSubmission.findMany({
    where: { formId: id },
    orderBy: { createdAt: "desc" },
    include: { answers: { include: { formField: true } } },
  });

  const rows = submissions.map((s) => {
    const byLabel: Record<string, string> = {};
    s.answers.forEach((a) => {
      byLabel[a.formField.label] = a.value;
    });
    return {
      id: s.id,
      submitterName: s.submitterName,
      submitterEmail: s.submitterEmail ?? "",
      submitterPhone: s.submitterPhone ?? "",
      createdAt: s.createdAt.toISOString(),
      labelValues: form.fields.reduce((acc, f) => {
        acc[f.label] = byLabel[f.label] ?? "";
        return acc;
      }, {} as Record<string, string>),
    };
  });

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/admin/forms" className="text-sm text-gray-500 hover:text-gray-700">
            ← 양식 관리
          </Link>
          <h1 className="page-title mt-2">{form.title} · 제출 목록</h1>
          <p className="text-sm text-gray-500 mt-0.5">총 {rows.length}건</p>
          {form.isAnonymous && (
            <p className="text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2 mt-2">
              익명 양식입니다. 제출자 이름·연락처는 표시 정책에 따라 비식별 처리됩니다.
            </p>
          )}
        </div>
        <a
          href={`/api/admin/forms/${id}/submissions/export`}
          className="btn-primary text-sm py-2.5 px-4 rounded-lg font-medium inline-flex items-center justify-center shrink-0"
        >
          엑셀 다운로드
        </a>
      </div>

      <SubmissionsTable
        formTitle={form.title}
        fields={form.fields.map((f) => f.label)}
        rows={rows}
        isAnonymousForm={form.isAnonymous}
      />
    </div>
  );
}

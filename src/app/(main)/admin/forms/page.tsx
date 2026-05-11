import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import FormListClient from "./FormListClient";

export const metadata = { title: "양식 관리 | GBIT Portal" };

export default async function AdminFormsPage() {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? "") && !user?.isSettingsAdmin) redirect("/dashboard");

  const forms = await prisma.form.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { submissions: true } },
      fields: { orderBy: { sortOrder: "asc" } },
      targetGroup: { select: { name: true } },
    },
  });

  return (
    <div className="max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">양식 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            건강검진·신청서 등 유동 양식을 만들고, 공개 링크로 비회원도 제출할 수 있습니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            href="/admin/form-target-groups"
            className="text-sm py-2.5 px-4 rounded-lg font-medium border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 inline-flex items-center justify-center"
          >
            대상 그룹
          </Link>
          <Link
            href="/admin/forms/new"
            className="btn-primary text-sm py-2.5 px-4 rounded-lg font-medium inline-flex items-center justify-center shrink-0"
          >
            + 양식 만들기
          </Link>
        </div>
      </div>

      <FormListClient forms={forms} />
    </div>
  );
}

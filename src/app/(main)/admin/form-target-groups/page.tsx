import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import FormTargetGroupsClient from "./FormTargetGroupsClient";

export const metadata = { title: "유동 양식 대상 그룹 | GBIT Portal" };

export default async function FormTargetGroupsPage() {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? "") && !user?.isSettingsAdmin) redirect("/dashboard");

  const groups = await prisma.formTargetGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { members: true, forms: true } } },
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/admin/forms" className="text-sm text-gray-500 hover:text-gray-700">
          ← 양식 관리
        </Link>
        <h1 className="page-title mt-2">유동 양식 대상 그룹</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          사원을 묶어 양식 접근·알림톡 수신 대상을 한 번에 지정합니다.
        </p>
      </div>

      <FormTargetGroupsClient
        initialGroups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          _count: g._count,
        }))}
      />
    </div>
  );
}

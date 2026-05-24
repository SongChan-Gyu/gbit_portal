import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import EmployeeGroupsClient from "./EmployeeGroupsClient";

export const metadata = { title: "그룹 설정 | GBIT Portal" };

export default async function EmployeeGroupsPage() {
  const session = await auth();
  const user = session?.user as { role?: string; isSettingsAdmin?: boolean } | undefined;
  if (!["PM", "ADMIN"].includes(user?.role ?? "") && !user?.isSettingsAdmin) redirect("/dashboard");

  const groups = await prisma.employeeGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { members: true, forms: true, notices: true, loginAnnouncements: true } } },
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="page-title">그룹 설정</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          사원 그룹을 만들어 유동양식·공지·로그인 팝업 노출 대상으로 공통 사용합니다.
        </p>
      </div>

      <EmployeeGroupsClient
        initialGroups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          _count: {
            members: g._count.members,
            forms: g._count.forms + g._count.notices + g._count.loginAnnouncements,
          },
        }))}
      />
    </div>
  );
}

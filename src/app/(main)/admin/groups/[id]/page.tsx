import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/db";
import EmployeeGroupEditClient from "./EmployeeGroupEditClient";

export const metadata = { title: "그룹 편집 | GBIT Portal" };

export default async function EmployeeGroupEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as { role?: string; isSettingsAdmin?: boolean } | undefined;
  if (!["PM", "ADMIN"].includes(user?.role ?? "") && !user?.isSettingsAdmin) redirect("/dashboard");

  const { id } = await params;
  const g = await prisma.employeeGroup.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          employee: {
            select: { id: true, name: true, empNo: true, employeeType: true, team: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!g) notFound();

  return (
    <div>
      <h1 className="page-title mb-4">그룹 편집</h1>
      <EmployeeGroupEditClient
        groupId={g.id}
        initialName={g.name}
        initialMembers={g.members.map((m) => ({ employeeId: m.employeeId, employee: m.employee }))}
      />
    </div>
  );
}

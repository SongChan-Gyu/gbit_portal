import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/db";
import FormTargetGroupEditClient from "./FormTargetGroupEditClient";

export const metadata = { title: "대상 그룹 편집 | GBIT Portal" };

export default async function FormTargetGroupEditPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? "") && !user?.isSettingsAdmin) redirect("/dashboard");

  const { id } = await params;
  const g = await prisma.formTargetGroup.findUnique({
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
    <div className="py-2">
      <h1 className="page-title mb-6">{g.name} · 구성원 편집</h1>
      <FormTargetGroupEditClient
        groupId={g.id}
        initialName={g.name}
        initialMembers={g.members.map((m) => ({
          employeeId: m.employeeId,
          employee: m.employee,
        }))}
      />
    </div>
  );
}

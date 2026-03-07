import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import EmployeeForm from "../EmployeeForm";

export default async function NewEmployeePage() {
  const session = await auth();
  const user = session!.user as any;
  if (!["PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const teams = await prisma.team.findMany({ orderBy:{ sortOrder:"asc" } });

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="page-title mb-6">사원 등록</h1>
      <EmployeeForm teams={teams} />
    </div>
  );
}

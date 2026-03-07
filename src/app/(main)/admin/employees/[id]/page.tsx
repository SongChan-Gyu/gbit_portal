import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/db";
import EmployeeForm from "../EmployeeForm";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const user = session!.user as any;
  if (!["PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const [employee, teams] = await Promise.all([
    prisma.employee.findUnique({ where:{ id }, include:{ user:true } }),
    prisma.team.findMany({ orderBy:{ sortOrder:"asc" } }),
  ]);
  if (!employee) notFound();

  // Date 객체를 ISO 문자열로 변환해서 클라이언트 컴포넌트에 전달
  const empForForm = {
    ...employee,
    hireDate: employee.hireDate instanceof Date
      ? employee.hireDate.toISOString()
      : String(employee.hireDate),
    birthDate: employee.birthDate
      ? (employee.birthDate instanceof Date ? employee.birthDate.toISOString().slice(0, 10) : String(employee.birthDate).slice(0, 10))
      : null,
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="page-title mb-6">사원 정보 수정</h1>
      <EmployeeForm teams={teams} employee={empForForm as any} />
    </div>
  );
}

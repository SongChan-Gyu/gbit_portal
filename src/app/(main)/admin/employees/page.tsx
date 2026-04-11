import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import EmployeesListClient from "./EmployeesListClient";
import ExcelImportBlock from "./ExcelImportBlock";

export default async function EmployeesPage({ searchParams }:{ searchParams:Promise<{ q?:string }> }) {
  const session = await auth();
  const user = session!.user as any;
  if (!["PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const { q: qRaw } = await searchParams;
  const q = qRaw ?? "";
  const employees = await prisma.employee.findMany({
    where: q ? { OR:[{name:{contains:q}},{empNo:{contains:q}},{position:{contains:q}}] } : {},
    include:{ team:true, user:true },
    orderBy:[{ team:{sortOrder:"asc"} }, { name:"asc" }],
  });

  const data = employees.map((e) => ({
    id: e.id,
    empNo: e.empNo,
    name: e.name,
    teamName: e.team?.name ?? null,
    position: e.position,
    dutyDept: e.dutyDept ?? null,
    employeeType: e.employeeType ?? null,
    role: e.role,
    status: e.status,
    username: e.user?.username ?? null,
    hireDate: e.hireDate.toISOString(),
    birthDate: e.birthDate ? e.birthDate.toISOString() : null,
    phone: e.phone ?? "",
    email: e.email ?? null,
  }));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="page-title">사원 관리</h1>
        <Link href="/admin/employees/new" className="btn-primary text-sm py-2.5 px-4 rounded-lg font-medium inline-flex items-center justify-center shrink-0">
          + 사원 등록
        </Link>
      </div>

      {/* 엑셀 일괄 등록 */}
      <div className="mb-8">
        <ExcelImportBlock />
      </div>

      {/* 검색 */}
      <form className="mb-6">
        <div className="flex flex-col sm:flex-row gap-2">
          <input name="q" defaultValue={q} className="input flex-1 min-w-0 rounded-lg border-gray-200" placeholder="이름 · 사번 · 직급 검색" />
          <button type="submit" className="btn-primary px-6 py-2.5 rounded-lg font-medium shrink-0">검색</button>
        </div>
      </form>

      <EmployeesListClient employees={data} />
    </div>
  );
}

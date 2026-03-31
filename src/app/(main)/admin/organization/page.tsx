import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import ExcelImportBlock from "@/app/(main)/admin/employees/ExcelImportBlock";
import EmployeesListClient from "@/app/(main)/admin/employees/EmployeesListClient";
import TeamsEditor from "@/app/(main)/admin/teams/TeamsEditor";

export const metadata = { title: "인사 관리 | GBIT Portal" };

export default async function OrganizationPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const session = await auth();
  const user = session!.user as any;
  if (!["PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const { tab: tabRaw, q: qRaw } = await searchParams;
  const tab = tabRaw ?? "employees";
  const q   = qRaw ?? "";

  // ── 탭별 데이터 ──────────────────────────────────────
  const [employees, teams, allEmployees] = await Promise.all([
    tab === "employees"
      ? prisma.employee.findMany({
          where: q ? { OR:[{name:{contains:q}},{empNo:{contains:q}},{position:{contains:q}}] } : {},
          include: { team:true, user:true },
          orderBy: [{ team:{sortOrder:"asc"} }, { name:"asc" }],
        })
      : Promise.resolve([]),

    tab === "teams"
      ? prisma.team.findMany({
          include: { leader:true, employees:{ include:{ user:true } } },
          orderBy: { sortOrder:"asc" },
        })
      : Promise.resolve([]),

    tab === "teams"
      ? prisma.employee.findMany({ where:{ status:"ACTIVE" }, orderBy:{ name:"asc" } })
      : Promise.resolve([]),
  ]);

  const TABS = [
    { id:"employees", label:"사원 관리" },
    { id:"teams",     label:"팀 관리" },
  ];
  const employeeListData = employees.map((e) => ({
    id: e.id,
    empNo: e.empNo,
    name: e.name,
    teamName: e.team?.name ?? null,
    position: e.position,
    dutyDept: e.dutyDept ?? null,
    employeeType: e.employeeType ?? null,
    role: e.role,
    status: e.status,
    username: (e as any).user?.username ?? null,
    hireDate: e.hireDate.toISOString(),
    birthDate: e.birthDate ? e.birthDate.toISOString() : null,
    phone: e.phone ?? "",
    email: e.email ?? null,
    emailEnabled: (e as any).emailEnabled ?? false,
  }));

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div>
        <h1 className="page-title">인사 관리</h1>
        <p className="page-subtitle">사원 정보 및 팀 구조를 관리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <a key={t.id} href={`?tab=${t.id}`}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </a>
        ))}
      </div>

      {/* ── 사원 관리 ─────────────────────────────── */}
      {tab === "employees" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">재직 중인 사원을 조회하고 관리합니다.</p>
            <Link href="/admin/employees/new" className="btn-primary text-sm py-2 px-4">+ 사원 등록</Link>
          </div>

          {/* 엑셀 일괄 등록: 파일 선택 → 미리보기 → 일괄 등록 */}
          <div className="mb-8">
            <ExcelImportBlock />
          </div>

          <form className="mb-4">
            <input type="hidden" name="tab" value="employees" />
            <div className="flex gap-2">
              <input name="q" defaultValue={q} className="input flex-1" placeholder="이름·사번·직위 검색" />
              <button className="btn-primary px-5">검색</button>
            </div>
          </form>
          <EmployeesListClient employees={employeeListData as any} />
        </div>
      )}

      {/* ── 팀 관리 ──────────────────────────────── */}
      {tab === "teams" && (
        <div>
          <p className="text-sm text-gray-500 mb-4">팀 구성 및 팀장 지정을 관리합니다.</p>
          <TeamsEditor teams={teams as any} allEmployees={allEmployees as any} />
        </div>
      )}
    </div>
  );
}

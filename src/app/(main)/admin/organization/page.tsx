import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import { formatYMD } from "@/lib/dateUtils";
import InviteButton from "@/app/(main)/admin/employees/InviteButton";
import ExcelImportBlock from "@/app/(main)/admin/employees/ExcelImportBlock";
import TeamsEditor from "@/app/(main)/admin/teams/TeamsEditor";

const STATUS_BADGE: Record<string,string> = {
  PENDING:"bg-gray-100 text-gray-500", INVITED:"bg-yellow-100 text-yellow-700",
  ACTIVE:"bg-green-100 text-green-700", INACTIVE:"bg-red-100 text-red-500",
};
const STATUS_LABEL: Record<string,string> = {
  PENDING:"미초대", INVITED:"초대발송", ACTIVE:"재직", INACTIVE:"퇴직",
};
const ROLE_LABEL: Record<string,string> = {
  STAFF:"팀원", TEAM_LEAD:"팀장", PM:"PM", ADMIN:"관리자",
};
const DUTY_DEPT_LABEL: Record<string, string> = {
  OPERATIONS: "운영부", EDUCATION: "교육부", WELFARE: "복지부", NONE: "해당사항없음",
};
function dutyDeptDisplay(dutyDept: string | null): string {
  if (!dutyDept) return "-";
  return DUTY_DEPT_LABEL[dutyDept] ?? dutyDept;
}

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

          {/* PC 테이블 */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="data-table">
              <thead>
                <tr>
                  <th>사번</th><th>이름</th><th>팀</th><th>직위</th>
                  <th>직무부서</th>
                  <th>역할</th><th>상태</th><th>아이디</th><th>입사일</th><th>액션</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td className="text-gray-500">{emp.empNo}</td>
                    <td className="font-medium">{emp.name}</td>
                    <td>{emp.team?.name ?? "-"}</td>
                    <td>{emp.position}</td>
                    <td className="text-xs">
                      <span className={["OPERATIONS", "EDUCATION", "WELFARE"].includes((emp as { dutyDept?: string }).dutyDept ?? "") ? "text-blue-600 font-medium" : "text-gray-600"}>
                        {dutyDeptDisplay((emp as { dutyDept?: string | null }).dutyDept ?? null)}
                        {["OPERATIONS", "EDUCATION", "WELFARE"].includes((emp as { dutyDept?: string }).dutyDept ?? "") && (
                          <span className="text-gray-500 font-normal ml-0.5">(2일)</span>
                        )}
                      </span>
                    </td>
                    <td><span className="text-xs font-medium">{ROLE_LABEL[emp.role]}</span></td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[emp.status]}`}>
                        {STATUS_LABEL[emp.status]}
                      </span>
                    </td>
                    <td className="text-gray-500 text-xs">{(emp as any).user?.username ?? "-"}</td>
                    <td className="text-xs text-gray-500">{formatYMD(emp.hireDate)}</td>
                    <td>
                      <div className="flex gap-2">
                        <Link href={`/admin/employees/${emp.id}`} className="text-blue-500 hover:underline text-xs">수정</Link>
                        <InviteButton employeeId={emp.id} name={emp.name} currentStatus={emp.status} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden space-y-3">
            {employees.map((emp) => (
              <div key={emp.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{emp.name}
                      <span className="ml-2 text-xs text-gray-500">{emp.empNo}</span>
                    </p>
                    <p className="text-sm text-gray-600">{emp.team?.name ?? "-"} · {emp.position}</p>
                    <p className="text-xs mt-0.5">
                      <span className={["OPERATIONS", "EDUCATION", "WELFARE"].includes((emp as { dutyDept?: string }).dutyDept ?? "") ? "text-blue-600 font-medium" : "text-gray-500"}>
                        {dutyDeptDisplay((emp as { dutyDept?: string | null }).dutyDept ?? null)}
                        {["OPERATIONS", "EDUCATION", "WELFARE"].includes((emp as { dutyDept?: string }).dutyDept ?? "") && (
                          <span className="text-gray-500 font-normal ml-0.5">(2일)</span>
                        )}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">입사 {formatYMD(emp.hireDate)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[emp.status]}`}>
                      {STATUS_LABEL[emp.status]}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                  <Link href={`/admin/employees/${emp.id}`} className="btn-secondary text-xs py-1.5 px-3 flex-1 text-center">수정</Link>
                  <div className="flex-1">
                    <InviteButton employeeId={emp.id} name={emp.name} currentStatus={emp.status} />
                  </div>
                </div>
              </div>
            ))}
          </div>
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

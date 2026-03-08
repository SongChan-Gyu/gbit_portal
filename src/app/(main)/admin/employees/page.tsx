import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import { formatYMD } from "@/lib/dateUtils";
import InviteButton from "./InviteButton";
import ExcelImportBlock from "./ExcelImportBlock";

const STATUS_BADGE: Record<string,string> = {
  PENDING:"bg-gray-100 text-gray-500",
  INVITED:"bg-yellow-100 text-yellow-700",
  ACTIVE: "bg-green-100 text-green-700",
  INACTIVE:"bg-red-100 text-red-500",
};
const STATUS_LABEL: Record<string,string> = {
  PENDING:"미초대", INVITED:"초대발송", ACTIVE:"재직", INACTIVE:"퇴직",
};
const ROLE_LABEL: Record<string,string> = {
  STAFF:"팀원", TEAM_LEAD:"팀장", PM:"PM", ADMIN:"관리자",
};
/** 직급부서 그리드 표시: 코드 → 한글명 (운영부/교육부/복지부는 귀속연도 초기화 시 2일 부여) */
const DUTY_DEPT_LABEL: Record<string, string> = {
  OPERATIONS: "운영부",
  EDUCATION: "교육부",
  WELFARE: "복지부",
  NONE: "해당사항없음",
};
function dutyDeptDisplay(dutyDept: string | null): string {
  if (!dutyDept) return "-";
  return DUTY_DEPT_LABEL[dutyDept] ?? dutyDept;
}

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
          <input name="q" defaultValue={q} className="input flex-1 min-w-0 rounded-lg border-gray-200" placeholder="이름 · 사번 · 직위 검색" />
          <button type="submit" className="btn-primary px-6 py-2.5 rounded-lg font-medium shrink-0">검색</button>
        </div>
      </form>

      {/* PC: 테이블 */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="data-table w-full min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">사번</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">이름</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">팀</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">직위</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">직급부서</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">역할</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">상태</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">아이디</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">입사일</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">액션</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50/50 last:border-0">
                <td className="px-4 py-3 text-gray-500 text-sm">{emp.empNo}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{emp.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{emp.team?.name ?? "-"}</td>
                <td className="px-4 py-3 text-sm">{emp.position}</td>
                <td className="px-4 py-3 text-xs">
                  <span className={["OPERATIONS", "EDUCATION", "WELFARE"].includes(emp.dutyDept ?? "") ? "text-blue-600 font-medium" : "text-gray-600"}>
                    {dutyDeptDisplay(emp.dutyDept ?? null)}
                    {["OPERATIONS", "EDUCATION", "WELFARE"].includes(emp.dutyDept ?? "") && (
                      <span className="text-gray-500 font-normal ml-0.5">(2일)</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3"><span className="text-xs font-medium text-gray-600">{ROLE_LABEL[emp.role]}</span></td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[emp.status]}`}>
                    {STATUS_LABEL[emp.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-sm">{emp.user?.username ?? "-"}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{formatYMD(emp.hireDate)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/admin/employees/${emp.id}`} className="text-sm text-blue-600 hover:text-blue-800 font-medium">수정</Link>
                    <InviteButton employeeId={emp.id} name={emp.name} currentStatus={emp.status} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일: 카드 (가독성·터치 친화) */}
      <div className="md:hidden space-y-4">
        {employees.map((emp) => (
          <div key={emp.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-800 text-base truncate">
                  {emp.name}
                  <span className="ml-2 text-sm text-gray-500 font-normal">{emp.empNo}</span>
                </p>
                <p className="text-sm text-gray-600 mt-0.5">{emp.team?.name ?? "-"} · {emp.position}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[emp.status]}`}>
                    {STATUS_LABEL[emp.status]}
                  </span>
                  <span className="text-xs text-gray-500">{ROLE_LABEL[emp.role]}</span>
                  <span className={["OPERATIONS", "EDUCATION", "WELFARE"].includes(emp.dutyDept ?? "") ? "text-blue-600 font-medium" : "text-gray-500"}>
                    {dutyDeptDisplay(emp.dutyDept ?? null)}
                    {["OPERATIONS", "EDUCATION", "WELFARE"].includes(emp.dutyDept ?? "") && (
                      <span className="text-gray-500 font-normal ml-0.5">(2일)</span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5">입사 {formatYMD(emp.hireDate)}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
              <Link href={`/admin/employees/${emp.id}`}
                className="flex-1 py-2.5 rounded-lg text-center text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
                수정
              </Link>
              <div className="flex-1 min-w-0">
                <InviteButton employeeId={emp.id} name={emp.name} currentStatus={emp.status} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

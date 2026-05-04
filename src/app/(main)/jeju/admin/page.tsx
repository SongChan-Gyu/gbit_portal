import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import JejuAdminTabs from "./JejuAdminTabs";
import Link from "next/link";

export const metadata = { title: "숙소 관리 | 제주도 숙소 | GBIT Portal" };

async function canManageJeju(user: { employeeId?: string; role?: string }) {
  if (user.role === "PM" || user.role === "ADMIN") return true;
  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true },
  });
  return isWelfareDept(emp);
}

export default async function JejuAdminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const user = session.user as any;
  if (!(await canManageJeju(user))) redirect("/jeju");

  /** 수동 등록 시 엑셀만 등록·초대 전 외부개발자(PENDING)도 신청자로 선택 가능 */
  const rawEmps = await prisma.employee.findMany({
    where: {
      status: { not: "INACTIVE" },
      OR: [{ status: { in: ["ACTIVE", "INVITED"] } }, { employeeType: "EXTERNAL" }],
    },
    orderBy: [{ team: { sortOrder: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      empNo: true,
      name: true,
      employeeType: true,
      status: true,
      team: { select: { name: true } },
    },
  });

  const employees = rawEmps.map((e) => ({
    id: e.id,
    name: e.name,
    empNo: e.empNo,
    teamName: e.team?.name ?? null,
    employeeType: e.employeeType,
    status: e.status,
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/jeju" className="text-gray-500 hover:text-gray-700 text-sm">← 예약하기</Link>
        </div>
        <h1 className="page-title">제주도 숙소 관리</h1>
        <p className="page-subtitle">
          예약금 이체 계좌·예약 불가일 설정 및 이관 내역 등록. 복지부·PM·관리자만 접근할 수 있습니다.
        </p>
      </div>
      <JejuAdminTabs employees={employees} />
    </div>
  );
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import JejuSettingsTab from "@/app/(main)/admin/leave-management/JejuSettingsTab";
import Link from "next/link";

export const metadata = { title: "숙소 관리 | 제주도 숙소 | GBIT Portal" };

/** 복지부 또는 PM/ADMIN만 접근 */
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/jeju" className="text-gray-500 hover:text-gray-700 text-sm">← 예약하기</Link>
        </div>
        <h1 className="page-title">제주도 숙소 관리</h1>
        <p className="page-subtitle">
          예약금 이체 계좌와 예약 불가일을 설정합니다. 복지부·PM·관리자만 접근할 수 있습니다.
        </p>
      </div>
      <JejuSettingsTab />
    </div>
  );
}

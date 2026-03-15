import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import JejuApproveClient from "./JejuApproveClient";

export const metadata = { title: "결재함 | 제주도 숙소 | GBIT Portal" };

async function canApproveJeju(user: { employeeId?: string; role?: string }) {
  if (user.role === "PM" || user.role === "ADMIN") return true;
  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true },
  });
  return isWelfareDept(emp);
}

export default async function JejuApprovePage() {
  const session = await auth();
  if (!session) redirect("/login");
  const user = session.user as any;
  if (!(await canApproveJeju(user))) redirect("/jeju");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">제주도 숙소 승인</h1>
        <p className="page-subtitle">
          제주도 숙소 신청 건을 승인하거나 반려합니다. 복지부·PM·관리자만 접근할 수 있습니다.
        </p>
      </div>
      <JejuApproveClient />
    </div>
  );
}

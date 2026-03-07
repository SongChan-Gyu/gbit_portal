import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import UserSwitchClient from "./UserSwitchClient";

export default async function UserSwitchPage() {
  const session = await auth();
  const user = session!.user as any;
  if (!["PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const [employees, leaveTypes] = await Promise.all([
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      include: { user: true, team: true },
      orderBy: [{ team: { sortOrder: "asc" } }, { name: "asc" }],
    }),
    prisma.leaveType.findMany({ where:{ isActive:true }, orderBy:{ sortOrder:"asc" } }),
  ]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="page-title">사용자 전환 / 테스트</h1>
        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">개발용</span>
      </div>
      <div className="card mb-4 bg-orange-50 border-orange-200 text-sm text-orange-800">
        ⚠️ <strong>개발/테스트 전용.</strong> 프로덕션에서 이 화면은 비활성화해야 합니다.
        <br/>사용자를 선택하면 해당 계정으로 전환(로그인)됩니다. 빠른 휴가 신청 생성도 가능합니다.
      </div>
      <UserSwitchClient employees={employees as any} leaveTypes={leaveTypes as any} />
    </div>
  );
}

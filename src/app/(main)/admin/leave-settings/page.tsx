import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import LeaveTypeEditor from "@/app/(main)/admin/leave-types/LeaveTypeEditor";
import Link from "next/link";

export const metadata = { title: "휴가 유형 설정 | GBIT Portal" };

export default async function LeaveSettingsPage() {
  const session = await auth();
  const user = session!.user as any;
  if (!["PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const leaveTypes = await prisma.leaveType.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">휴가 유형 설정</h1>
        <p className="page-subtitle">휴가 종류(연차·근속·경조 등) 정의, 결재 방식, 연차 차감 여부 등 마스터 정보를 관리합니다.</p>
      </div>

      <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
        <strong>휴가 할당(일괄 초기화·개별 추가/수정/이월/삭제)</strong>은{" "}
        <Link href="/admin/leave-management?tab=allocations" className="font-semibold underline hover:no-underline">
          휴가 부여·현황 → 휴가 할당
        </Link>
        에서 하세요.
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-4">아래는 휴가 종류·규칙만 다룹니다. 일수 부여는 「휴가 부여·현황」에서 하세요.</p>
        <LeaveTypeEditor leaveTypes={leaveTypes as any} />
      </div>
    </div>
  );
}

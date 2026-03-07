import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import ImpersonateClient from "./ImpersonateClient";
import { serializeDates } from "@/lib/serialize";
import { todayStr } from "@/lib/workdays";

export default async function ImpersonatePage() {
  const session = await auth();
  const user = session!.user as any;
  if (!["PM", "ADMIN"].includes(user.role)) redirect("/dashboard");

  const [approvers, pendingApprovals, cancelApprovals, employees, leaveTypes] = await Promise.all([
    prisma.employee.findMany({
      where: { role: { in: ["TEAM_LEAD", "PM", "ADMIN"] }, status: "ACTIVE" },
      include: { team: true },
      orderBy: { name: "asc" },
    }),
    prisma.leaveApproval.findMany({
      where: { status: "PENDING" },
      include: {
        approver: true,
        leaveRequest: {
          include: {
            employee: { include: { team: true } },
            items: { include: { leaveType: true } },
            approvals: { include: { approver: true }, orderBy: { step: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.leaveApproval.findMany({
      where: { status: "CANCEL_PENDING" },
      include: {
        approver: true,
        leaveRequest: {
          include: {
            employee: { include: { team: true } },
            items: { include: { leaveType: true } },
            approvals: { include: { approver: true }, orderBy: { step: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      include: { team: true },
      orderBy: [{ team: { sortOrder: "asc" } }, { name: "asc" }],
    }),
    prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  // leaveRequest가 CANCEL_REQUESTED인 것만 (include where는 relation 필터가 아님)
  const cancelList = cancelApprovals.filter((a) => a.leaveRequest?.status === "CANCEL_REQUESTED");

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="page-title">결재 테스트</h1>
        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">개발용</span>
      </div>
      <div className="card mb-4 bg-orange-50 border-orange-200 text-sm text-orange-800">
        ⚠️ 한 화면에서 <strong>휴가 결재·결재 취소·휴가 신청 올리기·카카오 알림톡</strong> 테스트를 할 수 있습니다. 결재자를 선택한 뒤 각 블록에서 동작을 확인하세요.
      </div>
      <ImpersonateClient
        approvers={serializeDates(approvers) as any}
        pendingApprovals={serializeDates(pendingApprovals) as any}
        cancelApprovals={serializeDates(cancelList) as any}
        employees={serializeDates(employees) as any}
        leaveTypes={serializeDates(leaveTypes) as any}
        todayStr={todayStr()}
      />
    </div>
  );
}

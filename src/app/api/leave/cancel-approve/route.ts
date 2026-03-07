import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * POST /api/leave/cancel-approve
 * 취소 신청에 대한 결재 처리
 * body: { requestId, action: "APPROVE" | "REJECT", comment? }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  const impersonate = req.headers.get("x-impersonate");
  const actorId = impersonate ?? user.employeeId;

  const { requestId, action, comment } = await req.json();
  if (!requestId || !action) return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });

  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: {
      items: { include: { leaveType: true, allocation: true } },
      approvals: { where: { status: "CANCEL_PENDING" }, orderBy: { step: "asc" } },
    },
  });

  if (!request) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (request.status !== "CANCEL_REQUESTED")
    return NextResponse.json({ error: "취소 신청 상태가 아닙니다." }, { status: 400 });

  // 현재 결재 차례인 approval 찾기 (테스트 시 x-impersonate로 결재자 대리)
  const myApproval = request.approvals.find(
    (a) => a.approverId === actorId && a.step === request.currentStep
  );
  if (!myApproval)
    return NextResponse.json({ error: "결재 권한이 없거나 순서가 아닙니다." }, { status: 403 });

  await prisma.$transaction(async (tx) => {
    if (action === "REJECT") {
      // 취소 반려 → 원래 APPROVED 상태로 복구
      await tx.leaveApproval.update({
        where: { id: myApproval.id },
        data: { status: "CANCEL_REJECTED", comment: comment ?? null, approvedAt: new Date() },
      });
      await tx.leaveRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED", cancelReason: null, currentStep: request.totalSteps },
      });
      await tx.leaveHistory.create({
        data: { leaveRequestId: requestId, action: "CANCEL_REJECTED", actorId, comment },
      });
    } else {
      // 취소 승인
      await tx.leaveApproval.update({
        where: { id: myApproval.id },
        data: { status: "CANCEL_APPROVED", comment: comment ?? null, approvedAt: new Date() },
      });

      const nextStep = request.currentStep + 1;
      const hasNextApprover = request.approvals.some((a) => a.step === nextStep);

      if (hasNextApprover) {
        // 다음 단계 대기
        await tx.leaveRequest.update({
          where: { id: requestId },
          data: { currentStep: nextStep },
        });
      } else {
        // 최종 승인 → 실제 취소 처리
        await tx.leaveRequest.update({
          where: { id: requestId },
          data: { status: "CANCELLED", cancelledAt: new Date(), currentStep: request.totalSteps },
        });

        // 사용일수 복원 (연차·돌봄 등 allocationId 있는 항목)
        for (const item of request.items) {
          if (item.allocationId) {
            await tx.leaveAllocation.update({
              where: { id: item.allocationId },
              data: { usedDays: { decrement: item.days } },
            });
          }
        }

        // 스탬프 복원 (힐링데이/스탬프 사용 휴가)
        await tx.stampCoupon.updateMany({
          where: { usedRequestId: requestId },
          data: { isUsed: false, usedForType: null, usedAt: null, usedRequestId: null },
        });

        await tx.leaveHistory.create({
          data: { leaveRequestId: requestId, action: "CANCEL_APPROVED", actorId, comment },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}

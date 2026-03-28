import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { releaseStampSlotsForLeaveRequest } from "@/lib/stampCard";

/**
 * POST /api/leave/request/[id]/cancel-request
 * 승인된 휴가에 대해 취소 신청을 올립니다.
 * - 일반: APPROVED → CANCEL_REQUESTED, 원 결재선에 CANCEL_PENDING 생성
 * - 자동승인(결재 행 없음)·신청자가 ADMIN/PM: 취소 심사 없이 즉시 CANCELLED (할당·스탬프 복원)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const { reason } = await req.json();
  if (!reason?.trim()) return NextResponse.json({ error: "취소 사유를 입력해주세요." }, { status: 400 });

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      items: { include: { leaveType: true, allocation: true } },
      approvals: { orderBy: { step: "asc" } },
    },
  });

  if (!request) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (request.employeeId !== user.employeeId)
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  if (request.status !== "APPROVED")
    return NextResponse.json({ error: "승인된 휴가만 취소 신청 가능합니다." }, { status: 400 });

  const applicant = await prisma.employee.findUnique({
    where: { id: request.employeeId },
    select: { role: true },
  });

  const originalApprovals = request.approvals
    .filter((a, i, arr) => arr.findIndex((x) => x.step === a.step) === i)
    .sort((a, b) => a.step - b.step);

  /** 자동승인 건은 LeaveApproval 행이 없어 취소 결재자가 비어 멈춤 → 즉시 취소. ADMIN/PM은 상위 결재 없음 가정으로 즉시 취소. */
  const skipCancelWorkflow =
    applicant?.role === "ADMIN" ||
    applicant?.role === "PM" ||
    originalApprovals.length === 0;

  if (skipCancelWorkflow) {
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: reason,
          currentStep: request.totalSteps,
        },
      });
      for (const item of request.items) {
        if (item.allocationId) {
          await tx.leaveAllocation.update({
            where: { id: item.allocationId },
            data: { usedDays: { decrement: item.days } },
          });
        }
      }
      await releaseStampSlotsForLeaveRequest(tx, id);
      await tx.leaveHistory.create({
        data: {
          leaveRequestId: id,
          action: "CANCEL_APPROVED",
          actorId: user.employeeId,
          comment: reason,
        },
      });
    });
    return NextResponse.json({ ok: true, directCancel: true });
  }

  const totalSteps = request.totalSteps;

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id },
      data: {
        status: "CANCEL_REQUESTED",
        cancelReason: reason,
        currentStep: 1,
      },
    });

    await tx.leaveApproval.deleteMany({
      where: { leaveRequestId: id, status: "CANCEL_PENDING" },
    });

    for (const ap of originalApprovals.slice(0, totalSteps)) {
      await tx.leaveApproval.create({
        data: {
          leaveRequestId: id,
          approverId: ap.approverId,
          step: ap.step,
          status: "CANCEL_PENDING",
        },
      });
    }

    await tx.leaveHistory.create({
      data: {
        leaveRequestId: id,
        action: "CANCEL_REQUESTED",
        actorId: user.employeeId,
        comment: reason,
      },
    });
  });

  return NextResponse.json({ ok: true });
}

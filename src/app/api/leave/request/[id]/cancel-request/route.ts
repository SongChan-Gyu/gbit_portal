import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * POST /api/leave/request/[id]/cancel-request
 * 승인된 휴가에 대해 취소 신청을 올립니다.
 * - status: APPROVED → CANCEL_REQUESTED
 * - cancelReason 저장
 * - 기존 결재자들에게 새 LeaveApproval(CANCEL 타입) 생성
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

  // 동일한 결재 단계로 취소 결재 생성
  const totalSteps = request.totalSteps;

  await prisma.$transaction(async (tx) => {
    // 상태 변경
    await tx.leaveRequest.update({
      where: { id },
      data: {
        status: "CANCEL_REQUESTED",
        cancelReason: reason,
        currentStep: 1,
      },
    });

    // 기존 취소 결재 기록 삭제(재신청 대비)
    await tx.leaveApproval.deleteMany({
      where: { leaveRequestId: id, status: "CANCEL_PENDING" },
    });

    // 취소 결재 레코드 생성 (status = "CANCEL_PENDING")
    const originalApprovals = request.approvals
      .filter((a, i, arr) => arr.findIndex((x) => x.step === a.step) === i)
      .sort((a, b) => a.step - b.step);

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

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * POST /api/leave/request/[id]/admin-cancel
 * 관리자(ADMIN) 전용: 모든 사람의 휴가결재 내역에 대해 직권 취소 처리
 * - APPROVED → CANCELLED, 할당 복원, 스탬프 복원
 * - PENDING → CANCELLED (할당 차감 전이므로 복원 불필요)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const user = session.user as any;
    if (user.role !== "ADMIN")
      return NextResponse.json({ error: "관리자만 직권 취소할 수 있습니다." }, { status: 403 });

    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        items: { include: { leaveType: true, allocation: true } },
      },
    });

    if (!request) return NextResponse.json({ error: "해당 휴가 신청을 찾을 수 없습니다." }, { status: 404 });
    if (request.status === "CANCELLED")
      return NextResponse.json({ error: "이미 취소된 신청입니다." }, { status: 400 });
    if (request.status === "REJECTED")
      return NextResponse.json({ error: "반려된 신청은 취소할 수 없습니다." }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelReason: "관리자 직권 취소",
        },
      });

      if (request.status === "APPROVED") {
        for (const item of request.items) {
          if (item.allocationId) {
            await tx.leaveAllocation.update({
              where: { id: item.allocationId },
              data: { usedDays: { decrement: item.days } },
            });
          }
        }
        await tx.stampCoupon.updateMany({
          where: { usedRequestId: id },
          data: { isUsed: false, usedForType: null, usedAt: null, usedRequestId: null },
        });
      }

      await tx.leaveHistory.create({
        data: {
          leaveRequestId: id,
          action: "ADMIN_CANCELLED",
          actorId: user.employeeId,
          comment: "관리자 직권 취소",
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin-cancel]", e);
    return NextResponse.json(
      { error: "취소 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}

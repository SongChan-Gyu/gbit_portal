import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import { kstYmd } from "@/lib/dateUtils";

/** 복지부 또는 PM/ADMIN: 전체 신청 목록 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const isPmAdmin = user.role === "PM" || user.role === "ADMIN";
  if (!isPmAdmin) {
    const emp = await prisma.employee.findUnique({
      where: { id: user.employeeId },
      include: { team: true },
    });
    if (!isWelfareDept(emp)) {
      return NextResponse.json({ error: "복지부 또는 관리자만 조회할 수 있습니다." }, { status: 403 });
    }
  }

  const list = await prisma.jejuAccommodation.findMany({
    where: {},
    include: {
      employee: { select: { id: true, name: true, empNo: true, team: true } },
      step1Approver: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      depositConfirmedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });

  return NextResponse.json(
    list.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      empNo: r.employee.empNo,
      teamName: r.employee.team?.name ?? null,
      startDate: kstYmd(r.startDate),
      endDate: kstYmd(r.endDate),
      nights: r.nights,
      reason: r.reason,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestCount: r.guestCount,
      depositorName: r.depositorName,
      status: r.status,
      // 1차 결재
      step1ApproverId: r.step1ApproverId,
      step1ApproverName: r.step1Approver?.name ?? null,
      step1ApprovedAt: r.step1ApprovedAt?.toISOString() ?? null,
      // 2차 결재 (입금확인)
      approvedById: r.approvedById,
      approvedByName: r.approvedBy?.name ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      depositStatus: r.depositStatus,
      depositConfirmedByName: r.depositConfirmedBy?.name ?? null,
      depositConfirmedAt: r.depositConfirmedAt?.toISOString() ?? null,
      // 반려
      rejectStep: r.rejectStep,
      rejectComment: r.rejectComment,
      // 취소
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      cancelReason: r.cancelReason,
      cancelRequestedAt: r.cancelRequestedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      // PM 전용: isPmAdmin
      isPmAdmin,
    }))
  );
}

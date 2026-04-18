import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import { kstYmd } from "@/lib/dateUtils";
import { getJejuCalendarYearStatsForEmployees, JEJU_YEARLY_SUBMIT_WARN_THRESHOLD } from "@/lib/jejuYearStats";
import { todayStr } from "@/lib/workdays";

/** 복지부 또는 PM/ADMIN: 전체 신청 목록 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const isPmAdmin = user.role === "PM" || user.role === "ADMIN";
  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true },
  });
  const isWelfare = isWelfareDept(emp);
  if (!isPmAdmin && !isWelfare) {
    return NextResponse.json({ error: "복지부 또는 관리자만 조회할 수 있습니다." }, { status: 403 });
  }
  const canStep1Approve = isWelfare;
  const canStep2Approve = isPmAdmin;
  const canCancelStep1Approve = isWelfare || user.role === "ADMIN";
  const canCancelStep2Approve = isPmAdmin;

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

  const calendarYear = parseInt(todayStr().slice(0, 4), 10);
  const statsMap = await getJejuCalendarYearStatsForEmployees(
    prisma,
    [...new Set(list.map((r) => r.employeeId))],
    calendarYear,
  );

  return NextResponse.json(
    list.map((r) => {
      const ys = statsMap.get(r.employeeId);
      const submitted = ys?.submittedCount ?? 0;
      const approvedStay = ys?.approvedStayInYearCount ?? 0;
      return {
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
      /** 달력연도(KST) 기준 집계 — 귀속연도와 무관 */
      jejuCalendarYear: calendarYear,
      jejuSubmittedThisYear: submitted,
      jejuApprovedStayThisYear: approvedStay,
      jejuHighYearlySubmissions: submitted >= JEJU_YEARLY_SUBMIT_WARN_THRESHOLD,
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
      // 권한 플래그
      isPmAdmin,
      isWelfare,
      canStep1Approve,
      canStep2Approve,
      canCancelStep1Approve,
      canCancelStep2Approve,
    };
    }),
  );
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { findHealingStampCard } from "@/lib/stampCard";
import { addDaysYMD, todayKstYmd } from "@/lib/dateUtils";
import { kstMidnightFromYmd } from "@/lib/workdays";
import { sendLeaveRequestAlimtalk } from "@/lib/kakao";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { employeeId?: string };
  const employeeId = user.employeeId;
  if (!employeeId) return NextResponse.json({ error: "사원 정보가 없습니다." }, { status: 400 });
  const { date } = await req.json();

  const lt = await prisma.leaveType.findUnique({ where: { code: "HEALING_DAY" } });
  if (!lt) return NextResponse.json({ error: "힐링데이 유형이 없습니다." }, { status: 404 });

  const dateYmd =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date.slice(0, 10))
      ? date.slice(0, 10)
      : todayKstYmd();
  const targetDate = kstMidnightFromYmd(dateYmd);
  const nextDay = kstMidnightFromYmd(addDaysYMD(dateYmd, 1));

  const dup = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { notIn: ["CANCELLED", "WITHDRAWN", "REJECTED"] },
      items: { some: { leaveTypeId: lt.id } },
      startDate: {
        gte: targetDate,
        lt: nextDay,
      },
    },
  });
  if (dup) {
    return NextResponse.json(
      { error: "해당 날짜에 이미 힐링데이가 신청되었거나 진행 중입니다." },
      { status: 400 },
    );
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { team: { include: { leader: true } } },
  });
  if (!employee || employee.status !== "ACTIVE") {
    return NextResponse.json({ error: "직원 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const pm = await prisma.employee.findFirst({ where: { role: "PM", status: "ACTIVE" } });
  const leaveApprovalPMCfg = await prisma.systemConfig.findUnique({ where: { key: "leaveApprovalPMId" } });
  const designatedPM = leaveApprovalPMCfg?.value
    ? await prisma.employee.findUnique({ where: { id: leaveApprovalPMCfg.value, status: "ACTIVE" } })
    : null;
  const effectivePM = designatedPM ?? pm;
  const isPmOrAdmin = employee.role === "PM" || employee.role === "ADMIN";
  const needsApproval = (lt.approvalSteps ?? 0) > 0;
  const totalSteps = needsApproval ? 1 : 0;
  const isAutoApprove = isPmOrAdmin || totalSteps === 0;
  const teamLeader = employee.team?.leader ?? null;
  const groupApprover = isAutoApprove
    ? null
    : employee.role === "TEAM_LEAD"
      ? effectivePM ?? teamLeader
      : teamLeader ?? effectivePM;

  try {
    if (isAutoApprove) {
      await prisma.$transaction(async (tx) => {
        const healCard = await findHealingStampCard(tx, employeeId);
        if (!healCard) throw new Error("NO_HEALING_SLOT");

        const reqRec = await tx.leaveRequest.create({
          data: {
            employeeId,
            startDate: targetDate,
            endDate: targetDate,
            totalDays: 0,
            reason: "힐링데이 (스탬프 장·힐링 권한 1회)",
            status: "APPROVED",
            currentStep: 0,
            totalSteps: 0,
          },
        });
        await tx.leaveRequestItem.create({
          data: {
            leaveRequestId: reqRec.id,
            leaveTypeId: lt.id,
            days: 0,
            startDate: targetDate,
            endDate: targetDate,
            reason: "힐링데이 (오후 4시 퇴근)",
          },
        });
        await tx.leaveHistory.create({
          data: {
            leaveRequestId: reqRec.id,
            action: "HEALING_DAY_APPLIED",
            actorId: employeeId,
            snapshot: JSON.stringify({
              date: dateYmd,
              stampCardId: healCard.id,
              healingSlot: true,
            }),
          },
        });
        const consumed = await tx.stampCard.updateMany({
          where: { id: healCard.id, healingUsed: false },
          data: { healingUsed: true, healingLeaveRequestId: reqRec.id },
        });
        if (consumed.count === 0) throw new Error("NO_HEALING_SLOT");
      });

      return NextResponse.json({ ok: true, status: "APPROVED" as const });
    }

    if (!groupApprover) {
      return NextResponse.json(
        { error: "결재자(팀장 또는 PM)가 없어 힐링데이를 접수할 수 없습니다. 관리자에게 문의해 주세요." },
        { status: 400 },
      );
    }

    const reqRec = await prisma.$transaction(async (tx) => {
      const healCard = await findHealingStampCard(tx, employeeId);
      if (!healCard) throw new Error("NO_HEALING_SLOT");

      const req = await tx.leaveRequest.create({
        data: {
          employeeId,
          startDate: targetDate,
          endDate: targetDate,
          totalDays: 0,
          reason: "힐링데이 (스탬프 장·힐링 권한 1회)",
          status: "PENDING",
          currentStep: 1,
          totalSteps: 1,
        },
      });
      await tx.leaveRequestItem.create({
        data: {
          leaveRequestId: req.id,
          leaveTypeId: lt.id,
          days: 0,
          startDate: targetDate,
          endDate: targetDate,
          reason: "힐링데이 (오후 4시 퇴근)",
        },
      });
      await tx.leaveApproval.create({
        data: { leaveRequestId: req.id, approverId: groupApprover.id, step: 1, status: "PENDING" },
      });
      const snap = JSON.stringify({ date: dateYmd, stampCardId: healCard.id, pending: true });
      await tx.leaveHistory.create({
        data: {
          leaveRequestId: req.id,
          action: "SUBMITTED",
          actorId: employeeId,
          snapshot: snap.length > 191 ? snap.slice(0, 188) + "..." : snap,
        },
      });
      return req;
    });

    let alimWarning: string | undefined;
    if (!groupApprover.phone) {
      alimWarning = "결재자 연락처가 없어 알림톡을 보내지 못했습니다.";
    } else if (groupApprover.alimtalkEnabled === false) {
      alimWarning = "결재자가 알림톡 미수신 설정이라 발송하지 않았습니다.";
    } else {
      try {
        await sendLeaveRequestAlimtalk(
          prisma,
          groupApprover.id,
          groupApprover.phone,
          groupApprover.name,
          employee.name,
          lt.name,
          dateYmd,
          dateYmd,
        );
      } catch (e) {
        console.warn("[healing-day] 알림톡 실패", e);
        alimWarning = "알림톡 발송에 실패했습니다. 결재함에서 확인해 주세요.";
      }
    }

    return NextResponse.json({
      ok: true,
      status: "PENDING" as const,
      requestId: reqRec.id,
      warning: alimWarning,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_HEALING_SLOT") {
      return NextResponse.json(
        { error: "사용 가능한 힐링데이 권한이 없습니다. (같은 장에 스탬프 5칸 이상·힐링 미사용)" },
        { status: 400 },
      );
    }
    throw e;
  }
}

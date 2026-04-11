import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { sendLeaveResultAlimtalk } from "@/lib/kakao";
import { writeAudit } from "@/lib/audit";
import { findHealingStampCard, releaseStampSlotsForLeaveRequest } from "@/lib/stampCard";
import { ANNUAL_CORE_SOURCE_CODES, isAnnualPoolSourceCode } from "@/lib/annualPoolSource";

export async function POST(req: Request) {
  try {
  const session = await auth();
  if (!session) return NextResponse.json({ error:"로그인이 필요합니다." }, { status:401 });
  const user = session.user as any;

  const impersonate = req.headers.get("x-impersonate");
  const actorId = impersonate ?? user.employeeId;

  const { approvalId, action, comment } = await req.json() as {
    approvalId: string;
    action: "APPROVE" | "REJECT";
    comment?: string;
  };

  if (action === "REJECT" && !comment?.trim())
    return NextResponse.json({ error:"반려 사유를 입력해 주세요." }, { status:400 });

  const approval = await prisma.leaveApproval.findUnique({
    where:{ id:approvalId },
    include:{ leaveRequest:{ include:{ items:{ include:{ leaveType:true, allocation:true } }, employee:true } } },
  });

  if (!approval) return NextResponse.json({ error:"결재 정보를 찾을 수 없습니다." }, { status:404 });
  if (approval.approverId !== actorId)
    return NextResponse.json({ error:"결재 권한이 없습니다." }, { status:403 });
  if (approval.status !== "PENDING")
    return NextResponse.json({ error:"이미 처리된 결재입니다." }, { status:400 });

  const request = approval.leaveRequest;
  if (request.status !== "PENDING")
    return NextResponse.json({ error:"진행 중인 신청이 아닙니다." }, { status:400 });

  const emp = request.employee;

  if (action === "REJECT") {
    await prisma.$transaction(async (tx) => {
      await tx.leaveApproval.update({ where:{id:approvalId}, data:{status:"REJECTED", comment, approvedAt:new Date()} });
      await tx.leaveRequest.update({ where:{id:request.id}, data:{status:"REJECTED"} });

      const needsStampRelease = request.items.some((i) => i.leaveType.requiresStamp);
      if (needsStampRelease) await releaseStampSlotsForLeaveRequest(tx, request.id);
      await tx.leaveHistory.create({
        data:{ leaveRequestId:request.id, action:"REJECTED", actorId, comment: comment ?? null },
      });
    });

    await writeAudit({ entityType:"LeaveRequest", entityId:request.id, action:"REJECTED",
      actorId, note:`${emp.name} 휴가 반려 (${comment})` });
    if (emp.phone && emp.alimtalkEnabled !== false) {
      await sendLeaveResultAlimtalk(prisma, emp.id, emp.phone, emp.name, "반려", comment ?? "");
    }
    return NextResponse.json({ ok:true });
  }

  // APPROVE — 모든 휴가 1단계 결재로 통일, 항상 최종 승인
  await prisma.$transaction(async (tx) => {
    await tx.leaveApproval.update({ where:{id:approvalId}, data:{status:"APPROVED", approvedAt:new Date(), comment: comment ?? null} });
    await tx.leaveRequest.update({ where:{id:request.id}, data:{status:"APPROVED"} });

    // 할당 차감: 연차 풀만 만료 시 다른 연차로 대체. 전용 부여 풀(CARE·포상 등)은 대체 없음.
    const now = new Date();
    for (const item of request.items) {
      let allocId = item.allocationId;
      if (!allocId) continue;
      const alloc = await tx.leaveAllocation.findUnique({ where: { id: allocId } });
      if (!alloc) continue;
      const expired = new Date(alloc.validUntil) < now;
      if (isAnnualPoolSourceCode(alloc.sourceCode)) {
        if (!alloc.isActive || expired) {
          const fallback = await tx.leaveAllocation.findFirst({
            where: {
              employeeId: request.employeeId,
              OR: [
                { sourceCode: { in: [...ANNUAL_CORE_SOURCE_CODES] } },
                { sourceCode: "ANNUAL" },
                { sourceCode: { startsWith: "MONTHLY_ACCRUAL_" } },
              ],
              isActive: true,
              validUntil: { gte: now },
            },
            orderBy: { validUntil: "asc" },
          });
          allocId = fallback?.id ?? null;
        }
      } else if (!alloc.isActive || expired) {
        allocId = null;
      }
      if (allocId) {
        await tx.leaveAllocation.update({
          where: { id: allocId },
          data: { usedDays: { increment: item.days } },
        });
      }
    }

    for (const item of request.items) {
      if (item.leaveType.code !== "HEALING_DAY") continue;
      const healCard = await findHealingStampCard(tx, request.employeeId);
      if (!healCard) throw new Error("HEALING_SLOT_GONE");
      const consumed = await tx.stampCard.updateMany({
        where: { id: healCard.id, healingUsed: false },
        data: { healingUsed: true, healingLeaveRequestId: request.id },
      });
      if (consumed.count === 0) throw new Error("HEALING_SLOT_GONE");
    }

    await tx.leaveHistory.create({
      data:{ leaveRequestId:request.id, action:"APPROVED", actorId,
        snapshot:JSON.stringify({ step:approval.step }) },
    });
  });

  await writeAudit({ entityType:"LeaveRequest", entityId:request.id, action:"APPROVED",
    actorId, note:`${emp.name} 휴가 승인 (총 ${request.totalDays}일)` });
  if (emp.phone && emp.alimtalkEnabled !== false) {
    await sendLeaveResultAlimtalk(prisma, emp.id, emp.phone, emp.name, "승인", "");
  }

  return NextResponse.json({ ok:true });
  } catch (e) {
    console.error("[leave/approve POST]", e);
    if (e instanceof Error && e.message === "HEALING_SLOT_GONE") {
      return NextResponse.json(
        {
          error:
            "힐링데이 승인 처리 중 스탬프 힐링 권한을 찾을 수 없습니다. 신청자의 스탬프 장 상태를 확인한 뒤 다시 시도해 주세요.",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "결재 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}

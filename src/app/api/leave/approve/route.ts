import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { sendLeaveRequestAlimtalk, sendLeaveResultAlimtalk } from "@/lib/kakao";
import { writeAudit } from "@/lib/audit";

/** 연차 = 기본연차 + 근속가산 + 이월연차만 (특별휴가·부서추가 제외) */
const ANNUAL_ONLY_SOURCES = ["CARRYOVER", "TENURE_BONUS", "BASE_ANNUAL"];

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

  if (action === "REJECT") {
    await prisma.$transaction(async (tx) => {
      await tx.leaveApproval.update({ where:{id:approvalId}, data:{status:"REJECTED", comment, approvedAt:new Date()} });
      await tx.leaveRequest.update({ where:{id:request.id}, data:{status:"REJECTED"} });

      // 스탬프 복원
      for (const item of request.items) {
        if (item.leaveType.requiresStamp) {
          await tx.stampCoupon.updateMany({
            where:{ usedRequestId:request.id },
            data:{ isUsed:false, usedForType:null, usedAt:null, usedRequestId:null },
          });
        }
      }
      await tx.leaveHistory.create({
        data:{ leaveRequestId:request.id, action:"REJECTED", actorId, comment: comment ?? null },
      });
    });

    const emp = request.employee;
    await writeAudit({ entityType:"LeaveRequest", entityId:request.id, action:"REJECTED",
      actorId, note:`${emp.name} 휴가 반려 (${comment})` });
    if (emp.phone && emp.alimtalkEnabled !== false) {
      await sendLeaveResultAlimtalk(prisma, emp.id, emp.phone, emp.name, "반려", comment ?? "");
    }
    return NextResponse.json({ ok:true });
  }

  // APPROVE
  const isLastStep = approval.step >= request.totalSteps;

  await prisma.$transaction(async (tx) => {
    await tx.leaveApproval.update({ where:{id:approvalId}, data:{status:"APPROVED", approvedAt:new Date(), comment: comment ?? null} });

    if (isLastStep) {
      await tx.leaveRequest.update({ where:{id:request.id}, data:{status:"APPROVED"} });

      // 연차·돌봄 할당 차감 (allocationId 있는 항목만; 만료된 연차풀은 fallback)
      const now = new Date();
      const CARE_SOURCE = "CARE";
      for (const item of request.items) {
        let allocId = item.allocationId;
        if (!allocId) continue;
        const alloc = await tx.leaveAllocation.findUnique({ where: { id: allocId } });
        if (alloc?.sourceCode !== CARE_SOURCE && alloc?.sourceCode !== "HOLIDAY_EXT" && alloc?.sourceCode !== "BIRTHDAY_HALF" && (!alloc?.isActive || new Date(alloc.validUntil) < now)) {
          const fallback = await tx.leaveAllocation.findFirst({
            where: {
              employeeId: request.employeeId,
              sourceCode: { in: ANNUAL_ONLY_SOURCES },
              isActive: true, validUntil: { gte: now },
            },
            orderBy: { validUntil: "asc" },
          });
          allocId = fallback?.id ?? null;
        } else if (!alloc?.isActive) {
          allocId = null;
        }
        if (allocId) {
          await tx.leaveAllocation.update({
            where: { id: allocId },
            data: { usedDays: { increment: item.days } },
          });
        }
      }

      await tx.leaveHistory.create({
        data:{ leaveRequestId:request.id, action:"APPROVED", actorId,
          snapshot:JSON.stringify({ step:approval.step, isLastStep }) },
      });
    } else {
      // 다음 단계로: currentStep 갱신 후 다음 결재자(PM) 결재 행 생성
      const nextStep = approval.step + 1;
      await tx.leaveRequest.update({ where:{id:request.id}, data:{currentStep:nextStep} });
      const pm = await tx.employee.findFirst({ where: { role: "PM", status: "ACTIVE" } });
      if (pm) {
        await tx.leaveApproval.create({
          data: {
            leaveRequestId: request.id,
            approverId: pm.id,
            step: nextStep,
            status: "PENDING",
          },
        });
      }
      await tx.leaveHistory.create({
        data:{ leaveRequestId:request.id, action:`STEP_${approval.step}_APPROVED`, actorId },
      });
    }
  });

  const emp = request.employee;
  if (isLastStep) {
    await writeAudit({ entityType:"LeaveRequest", entityId:request.id, action:"APPROVED",
      actorId, note:`${emp.name} 휴가 최종 승인 (총 ${request.totalDays}일)` });
    if (emp.phone && emp.alimtalkEnabled !== false) {
      await sendLeaveResultAlimtalk(prisma, emp.id, emp.phone, emp.name, "승인", "");
    }
  } else {
    // 다음 단계(예: PM) 결재 요청 알림톡
    const pm = await prisma.employee.findFirst({
      where: { role: "PM", status: "ACTIVE" },
    });
    if (pm?.phone && pm.alimtalkEnabled !== false) {
      const typeNames = request.items.map((i) => i.leaveType.name).join("+");
      const first = request.items[0];
      const last = request.items[request.items.length - 1];
      const startStr = first?.startDate.toISOString().slice(0, 10);
      const endStr = last?.endDate.toISOString().slice(0, 10);
      try {
        await sendLeaveRequestAlimtalk(
          prisma,
          pm.id,
          pm.phone,
          pm.name,
          emp.name,
          typeNames,
          startStr,
          endStr,
        );
      } catch (e) {
        console.warn("[leave/approve] 2차 결재 알림톡 실패 (결재는 반영됨)", e);
      }
    }
  }

  return NextResponse.json({ ok:true });
  } catch (e) {
    console.error("[leave/approve POST]", e);
    return NextResponse.json(
      { error: "결재 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM","ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error:"관리자 전용" }, { status:403 });

  const { employeeId, leaveTypeCode, startDate, endDate, reason } = await req.json();

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { team: { include: { leader: true } } },
  });
  if (!emp) return NextResponse.json({ error:"사원 없음" }, { status:404 });

  const lt = await prisma.leaveType.findUnique({ where:{ code: leaveTypeCode } });
  if (!lt) return NextResponse.json({ error:"휴가유형 없음" }, { status:404 });

  const start = new Date(startDate);
  const end   = new Date(endDate ?? startDate);
  const days  = lt.isHalf ? 0.5 : 1;

  // 사용 가능 할당 조회
  const alloc = lt.deductFromBalance
    ? await prisma.leaveAllocation.findFirst({
        where: { employeeId, isActive:true, validUntil:{ gte: new Date() } },
        orderBy: { validUntil: "asc" },
      })
    : null;

  const teamLeader = emp.team?.leader;
  const pm = await prisma.employee.findFirst({ where:{ role:"PM", status:"ACTIVE" } });
  const maxSteps = lt.approvalSteps;

  const request = await prisma.$transaction(async (tx) => {
    const req2 = await tx.leaveRequest.create({
      data: {
        employeeId, startDate: start, endDate: end,
        totalDays: days, reason: reason ?? "(테스트)", status: "PENDING",
        currentStep: 1, totalSteps: maxSteps,
      },
    });
    await tx.leaveRequestItem.create({
      data: {
        leaveRequestId: req2.id, leaveTypeId: lt.id,
        allocationId: alloc?.id ?? null,
        days, startDate: start, endDate: end, reason: reason ?? "(테스트)",
      },
    });
    if (teamLeader) {
      await tx.leaveApproval.create({
        data: { leaveRequestId:req2.id, approverId:teamLeader.id, step:1, status:"PENDING" },
      });
    }
    if (pm && maxSteps >= 2) {
      await tx.leaveApproval.create({
        data: { leaveRequestId:req2.id, approverId:pm.id, step:2, status:"PENDING" },
      });
    }
    await tx.leaveHistory.create({
      data: { leaveRequestId:req2.id, action:"SUBMITTED_BY_ADMIN_TEST", actorId:u.employeeId },
    });
    return req2;
  });

  return NextResponse.json({ ok:true, id:request.id });
}

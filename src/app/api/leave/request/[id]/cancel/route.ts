import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const user = session.user as any;

  const request = await prisma.leaveRequest.findUnique({
    where:{ id },
    include:{ items:{ include:{ leaveType:true } } },
  });
  if (!request) return NextResponse.json({ error:"신청을 찾을 수 없습니다." }, { status:404 });
  if (request.employeeId !== user.employeeId)
    return NextResponse.json({ error:"권한이 없습니다." }, { status:403 });
  if (request.status !== "PENDING")
    return NextResponse.json({ error:"대기 상태의 신청만 취소할 수 있습니다." }, { status:400 });

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where:{ id:request.id },
      data:{ status:"CANCELLED", cancelledAt:new Date() },
    });
    // 스탬프 복원
    await tx.stampCoupon.updateMany({
      where:{ usedRequestId:request.id },
      data:{ isUsed:false, usedForType:null, usedAt:null, usedRequestId:null },
    });
    await tx.leaveHistory.create({
      data:{ leaveRequestId:request.id, action:"CANCELLED", actorId:user.employeeId },
    });
  });

  return NextResponse.json({ ok:true });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const session = await auth();
  const u = session?.user as any;
  if (!["PM","ADMIN"].includes(u?.role ?? "")) return NextResponse.json({ error:"권한 없음" }, { status:403 });

  const body = await req.json();
  await prisma.leaveType.update({
    where:{ id },
    data:{
      name:body.name, daysPerUnit:body.daysPerUnit, deductFromBalance:body.deductFromBalance,
      approvalSteps:body.approvalSteps, maxPerMonth:body.maxPerMonth??null, maxPerYear:body.maxPerYear??null,
      requiresStamp:body.requiresStamp, stampCount:body.stampCount??null,
      isHalf:body.isHalf, isAmOnly:body.isAmOnly, isPmOnly:body.isPmOnly,
      validityBasis:body.validityBasis, validityMonths:body.validityMonths??null,
      isActive:body.isActive, sortOrder:body.sortOrder, color:body.color,
    },
  });
  return NextResponse.json({ ok:true });
}

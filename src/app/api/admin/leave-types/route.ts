import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM","ADMIN"].includes(u?.role ?? "")) return NextResponse.json({ error:"권한 없음" }, { status:403 });

  const body = await req.json();
  if (!body.code || !body.name) return NextResponse.json({ error:"코드/이름 필수" }, { status:400 });

  const dup = await prisma.leaveType.findUnique({ where:{code:body.code} });
  if (dup) return NextResponse.json({ error:"이미 존재하는 코드입니다." }, { status:400 });

  const lt = await prisma.leaveType.create({
    data:{
      code:body.code, name:body.name, daysPerUnit:body.daysPerUnit??1,
      deductFromBalance:body.deductFromBalance??true, approvalSteps:body.approvalSteps??2,
      maxPerMonth:body.maxPerMonth??null, maxPerYear:body.maxPerYear??null,
      requiresStamp:body.requiresStamp??false, stampCount:body.stampCount??null,
      isHalf:body.isHalf??false, isAmOnly:body.isAmOnly??false, isPmOnly:body.isPmOnly??false,
      validityBasis:body.validityBasis??"FISCAL", validityMonths:body.validityMonths??null,
      isActive:body.isActive??true, sortOrder:body.sortOrder??99, color:body.color??"#3b82f6",
    },
  });
  return NextResponse.json({ ok:true, id:lt.id });
}

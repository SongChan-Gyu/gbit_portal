import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM","ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error:"관리자 전용" }, { status:403 });

  const { employeeId } = await req.json();
  const emp = await prisma.employee.findUnique({ where:{ id:employeeId }, include:{ user:true } });
  if (!emp?.user) return NextResponse.json({ error:"계정이 없는 사원입니다." }, { status:404 });

  const token = uuid();
  await prisma.testBypass.create({
    data: { employeeId, token, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  return NextResponse.json({ token });
}

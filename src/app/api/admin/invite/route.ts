import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const { employeeId } = await req.json();
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  if (!emp) return NextResponse.json({ error: "사원 없음" }, { status: 404 });
  if (emp.user)
    return NextResponse.json({ error: "이미 계정이 있는 사원입니다." }, { status: 400 });

  const token = uuid();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // 기존 미사용 토큰 만료 처리
  await prisma.inviteToken.updateMany({
    where: { employeeId, usedAt: null },
    data: { expiresAt: new Date() },
  });

  await prisma.inviteToken.create({ data: { employeeId, token, expiresAt } });
  await prisma.employee.update({ where: { id: employeeId }, data: { status: "INVITED" } });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = `${baseUrl}/register/${token}`;

  return NextResponse.json({ ok: true, url, expiresAt: expiresAt.toISOString() });
}

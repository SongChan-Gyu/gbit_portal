import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { employeeId } = await req.json();
  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return NextResponse.json({ error: "사원 없음" }, { status: 404 });
  if (emp.status === "ACTIVE")
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

  // 카카오톡 알림톡은 선택적 (설정 없으면 스킵)
  try {
    const { sendInviteAlimtalk } = await import("@/lib/kakao");
    await sendInviteAlimtalk(prisma, employeeId, emp.phone, emp.name, url);
  } catch {
    // 알림톡 미설정 시 무시 — URL은 화면에 표시됨
  }

  return NextResponse.json({ ok: true, url, expiresAt: expiresAt.toISOString() });
}

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  const newPassword = String(body.newPassword ?? "").trim();
  if (!token || !newPassword)
    return NextResponse.json({ error: "토큰과 새 비밀번호를 입력해 주세요." }, { status: 400 });
  if (newPassword.length < 8)
    return NextResponse.json({ error: "비밀번호는 8자 이상이어야 합니다." }, { status: 400 });

  const reset = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!reset || reset.usedAt || reset.expiresAt < new Date())
    return NextResponse.json({ error: "유효하지 않거나 만료된 링크입니다. 비밀번호 찾기를 다시 시도해 주세요." }, { status: 400 });

  const hash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: hash } }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
  ]);

  return NextResponse.json({ ok: true, message: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요." });
}

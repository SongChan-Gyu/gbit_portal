import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { emailEnabledSyncedToAddress } from "@/lib/employeeEmailPrefs";

export async function POST(req: Request) {
  const { token, username, password, email, alimtalkEnabled } = await req.json();

  if (!token || !username || !password)
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });

  const emailNorm = String(email ?? "").trim();
  if (!emailNorm)
    return NextResponse.json({ error: "이메일 주소를 입력해 주세요." }, { status: 400 });

  if (username.length < 3)
    return NextResponse.json({ error: "아이디는 3자 이상이어야 합니다." }, { status: 400 });

  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return NextResponse.json({ error: "아이디는 영문·숫자·_ 만 사용 가능합니다." }, { status: 400 });

  if (password.length < 8)
    return NextResponse.json({ error: "비밀번호는 8자 이상이어야 합니다." }, { status: 400 });

  // 토큰 검증
  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { employee: true },
  });

  if (!invite)
    return NextResponse.json({ error: "유효하지 않은 초대 링크입니다." }, { status: 400 });

  if (invite.usedAt)
    return NextResponse.json({ error: "이미 사용된 초대 링크입니다." }, { status: 400 });

  if (invite.expiresAt < new Date())
    return NextResponse.json({ error: "만료된 초대 링크입니다." }, { status: 400 });

  // 아이디 중복 확인
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists)
    return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 400 });

  // 이미 계정 있는 경우
  const existingUser = await prisma.user.findUnique({ where: { employeeId: invite.employeeId } });
  if (existingUser)
    return NextResponse.json({ error: "이미 계정이 등록된 사원입니다." }, { status: 400 });

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    // 계정 생성
    await tx.user.create({
      data: { employeeId: invite.employeeId, username, passwordHash },
    });

    // 토큰 사용 처리
    await tx.inviteToken.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    // 사원 상태 ACTIVE + 이메일 업데이트
    await tx.employee.update({
      where: { id: invite.employeeId },
      data: {
        status: "ACTIVE",
        email: emailNorm,
        emailEnabled: emailEnabledSyncedToAddress(emailNorm),
        alimtalkEnabled: alimtalkEnabled !== false,
      },
    });
  });

  return NextResponse.json({ ok: true, username });
}

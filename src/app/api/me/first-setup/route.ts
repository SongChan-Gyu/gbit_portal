import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

const schema = z.object({
  username: z.string().trim().min(3, "아이디는 3자 이상이어야 합니다.").max(50),
  newPassword: z.string().trim().min(8, "비밀번호는 8자 이상이어야 합니다.").max(200),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const employeeId = (session.user as any)?.employeeId as string | undefined;
  if (!employeeId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const username = parsed.data.username.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (username.length < 3) {
    return NextResponse.json({ error: "아이디는 영문/숫자/_ 기준 3자 이상이어야 합니다." }, { status: 400 });
  }

  const me = await prisma.user.findUnique({
    where: { employeeId },
    select: { id: true, mustChangePassword: true },
  });
  if (!me) return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  if (!me.mustChangePassword) {
    return NextResponse.json({ error: "초기 설정 대상이 아닙니다." }, { status: 400 });
  }

  const dup = await prisma.user.findFirst({
    where: { username, NOT: { id: me.id } },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 400 });

  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: me.id },
    data: {
      username,
      passwordHash: hash,
      mustChangePassword: false,
    },
  });

  return NextResponse.json({ ok: true, message: "아이디/비밀번호 초기 설정이 완료되었습니다. 다시 로그인해 주세요." });
}

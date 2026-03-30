import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().trim().min(1, "현재 비밀번호를 입력해 주세요."),
  newPassword: z.string().trim().min(8, "새 비밀번호는 8자 이상이어야 합니다.").max(200),
});

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "새 비밀번호가 현재 비밀번호와 같습니다." }, { status: 400 });
  }

  const employeeId = (session.user as any)?.employeeId as string | undefined;
  if (!employeeId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { employeeId },
    select: { id: true, passwordHash: true },
  });
  if (!user) return NextResponse.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 400 });

  const nextHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: nextHash, mustChangePassword: false },
  });

  return NextResponse.json({ ok: true, message: "비밀번호가 변경되었습니다." });
}

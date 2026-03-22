import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { apiError, rateLimited } from "@/lib/apiError";
import { checkRateLimit, getRateLimitKey } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const key = getRateLimitKey(req, "reset-password");
  const { ok, retryAfter } = await checkRateLimit(key, true);
  if (!ok) {
    return rateLimited(
      `요청이 너무 많습니다. ${retryAfter ? `${Math.ceil(retryAfter / 60)}분 후` : "잠시 후"} 다시 시도해 주세요.`
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "토큰과 새 비밀번호를 입력해 주세요.";
    return apiError(msg, { status: 400, code: "VALIDATION_ERROR" });
  }
  const { token, newPassword } = parsed.data;

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

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendMail } from "@/lib/email";
import { wrapEmailBody } from "@/lib/emailTemplate";
import crypto from "crypto";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { apiError, rateLimited } from "@/lib/apiError";
import { checkRateLimit, getRateLimitKey } from "@/lib/rateLimit";

/**
 * 비밀번호 찾기: 아이디 입력 시 재설정 링크를 등록 이메일로 발송.
 * 사용자 노출 최소화를 위해 계정 유무와 관계없이 동일 메시지 반환.
 */
export async function POST(req: Request) {
  const key = getRateLimitKey(req, "forgot-password");
  const { ok, retryAfter } = await checkRateLimit(key, true);
  if (!ok) {
    return rateLimited(
      `요청이 너무 많습니다. ${retryAfter ? `${Math.ceil(retryAfter / 60)}분 후` : "잠시 후"} 다시 시도해 주세요.`
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = forgotPasswordSchema.safeParse({ username: body.username });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "아이디를 입력해 주세요.";
    return apiError(msg, { status: 400, code: "VALIDATION_ERROR" });
  }
  const { username } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { username },
    include: { employee: true },
  });

  if (!user?.employee) {
    return NextResponse.json({
      ok: true,
      message: "등록된 이메일로 비밀번호 재설정 링크를 발송했습니다. 이메일을 확인해 주세요.",
    });
  }

  const to = user.employee.email?.trim() || "";
  if (!to) {
    return NextResponse.json({
      ok: true,
      message: "등록된 이메일로 비밀번호 재설정 링크를 발송했습니다. 이메일을 확인해 주세요.",
    });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1시간

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? (req.headers.get("x-forwarded-proto") && req.headers.get("host")
    ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
    : "http://localhost:3000");
  const resetUrl = `${baseUrl.replace(/\/$/, "")}/reset-password?token=${token}`;

  try {
    await sendMail({
      to,
      subject: "[GBIT Portal] 비밀번호 재설정",
      text: `비밀번호 재설정을 요청하셨습니다. 아래 링크에서 새 비밀번호를 설정해 주세요. (1시간 유효)\n\n${resetUrl}`,
      html: wrapEmailBody(`
        <p>비밀번호 재설정을 요청하셨습니다.</p>
        <p>아래 버튼(링크)에서 새 비밀번호를 설정해 주세요. <strong>링크는 1시간 동안만 유효</strong>합니다.</p>
        <p style="margin: 20px 0;"><a href="${resetUrl}" style="display:inline-block; padding: 12px 24px; background:#1e40af; color:#fff; text-decoration:none; border-radius: 8px; font-weight: 600;">비밀번호 재설정하기</a></p>
        <p style="color:#6b7280;font-size:12px;">요청하지 않으셨다면 이 메일을 무시하세요.</p>
      `, { title: "비밀번호 재설정" }),
    });
  } catch (e: any) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, token } }).catch(() => null);
    return NextResponse.json({
      error: process.env.NODE_ENV === "development" ? e?.message : "이메일 발송에 실패했습니다.",
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "등록된 이메일로 비밀번호 재설정 링크를 발송했습니다. 이메일을 확인해 주세요.",
  });
}

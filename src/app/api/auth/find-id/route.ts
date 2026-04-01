import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendMail } from "@/lib/email";
import { wrapEmailBody } from "@/lib/emailTemplate";
import { findIdSchema } from "@/lib/validations/auth";
import { apiError, rateLimited } from "@/lib/apiError";
import { checkRateLimit, getRateLimitKey } from "@/lib/rateLimit";

/**
 * 아이디 찾기: 이름 + 이메일로 본인 확인 후, 해당 이메일로 아이디(username) 발송.
 * HRM에서 흔히 쓰는 방식. 일치하는 계정이 없어도 동일 메시지 반환(정보 노출 최소화).
 */
export async function POST(req: Request) {
  const key = getRateLimitKey(req, "find-id");
  const { ok, retryAfter } = await checkRateLimit(key, true);
  if (!ok) {
    return rateLimited(
      `요청이 너무 많습니다. ${retryAfter ? `${Math.ceil(retryAfter / 60)}분 후` : "잠시 후"} 다시 시도해 주세요.`
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = findIdSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "이름과 이메일을 입력해 주세요.";
    return apiError(msg, { status: 400, code: "VALIDATION_ERROR" });
  }
  const { name, email } = parsed.data;

  const employee = await prisma.employee.findFirst({
    where: {
      name: { equals: name },
      email: { equals: email },
    },
    include: { user: true },
  });

  if (!employee?.user) {
    return NextResponse.json({
      ok: true,
      message: "일치하는 정보가 있으면 등록된 이메일로 아이디를 발송했습니다. 이메일을 확인해 주세요.",
    });
  }

  const to = email;

  try {
    await sendMail({
      to,
      subject: "[GBIT Portal] 아이디 안내",
      text: `${employee.name}님의 GBIT Portal 아이디는 [${employee.user.username}] 입니다.`,
      html: wrapEmailBody(
        `<p>${employee.name}님, 안녕하세요.</p><p>요청하신 <strong>아이디</strong>는 <strong>${employee.user.username}</strong> 입니다.</p><p>로그인 화면에서 해당 아이디로 로그인해 주세요.</p>`,
        { title: "아이디 안내" }
      ),
    });
  } catch (e: any) {
    return NextResponse.json({
      error: process.env.NODE_ENV === "development" ? e?.message : "이메일 발송에 실패했습니다. SMTP 설정을 확인해 주세요.",
    }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "등록된 이메일로 아이디를 발송했습니다. 이메일을 확인해 주세요.",
  });
}

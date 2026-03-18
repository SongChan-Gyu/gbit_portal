import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendMail } from "@/lib/email";
import { wrapEmailBody } from "@/lib/emailTemplate";

/**
 * 아이디 찾기: 이름 + 이메일로 본인 확인 후, 해당 이메일로 아이디(username) 발송.
 * HRM에서 흔히 쓰는 방식. 일치하는 계정이 없어도 동일 메시지 반환(정보 노출 최소화).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!name || !email)
    return NextResponse.json({ error: "이름과 이메일을 입력해 주세요." }, { status: 400 });

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

  const override = process.env.TEST_EMAIL_OVERRIDE?.trim();
  if (!override && employee.emailEnabled === false) {
    return NextResponse.json({
      error: "이메일 전송(수신)이 미사용 상태입니다. 로그인 후 내 정보에서 이메일 전송을 사용으로 바꾼 뒤 다시 시도해 주세요.",
    }, { status: 400 });
  }
  const to = override || email;

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

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { sendMail } from "@/lib/email";
import { wrapEmailBody } from "@/lib/emailTemplate";

/** 초대 링크를 사원 이메일로 전송 (관리자 전용) */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { employeeId, url } = await req.json();
  if (!employeeId || !url || typeof url !== "string")
    return NextResponse.json({ error: "employeeId와 url이 필요합니다." }, { status: 400 });

  const emp = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!emp) return NextResponse.json({ error: "사원을 찾을 수 없습니다." }, { status: 404 });

  // 테스트용: .env.local에 TEST_EMAIL_OVERRIDE=zx2253@naver.com 등 설정 시 해당 주소로 발송
  const override = process.env.TEST_EMAIL_OVERRIDE?.trim();
  const email = override || emp.email?.trim();
  if (!email)
    return NextResponse.json({ error: "해당 사원에 이메일이 등록되어 있지 않습니다." }, { status: 400 });

  try {
    await sendMail({
      to: email,
      subject: `[GBIT Portal] 회원가입 초대 - ${emp.name}님`,
      text: `${emp.name}님, GBIT Portal 회원가입 초대입니다.\n\n아래 링크로 접속하여 아이디·비밀번호를 설정해 주세요.\n\n${url}\n\n※ 링크는 1회만 사용 가능하며, 7일 후 만료됩니다.`,
      html: wrapEmailBody(`
        <p>${emp.name}님, 안녕하세요.</p>
        <p>GBIT Portal 회원가입 초대 메일입니다. 아래 버튼으로 접속하여 <strong>아이디·비밀번호를 설정</strong>해 주세요.</p>
        <p style="margin: 20px 0;"><a href="${url}" style="display:inline-block; padding: 12px 24px; background:#1e40af; color:#fff; text-decoration:none; border-radius: 8px; font-weight: 600;">회원가입 하기</a></p>
        <p style="color:#6b7280;font-size:12px;">※ 링크는 1회만 사용 가능하며, 7일 후 만료됩니다.</p>
      `, { title: "회원가입 초대" }),
    });
    return NextResponse.json({ ok: true, message: "이메일을 발송했습니다." });
  } catch (e: any) {
    const message = e?.message ?? "이메일 발송에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

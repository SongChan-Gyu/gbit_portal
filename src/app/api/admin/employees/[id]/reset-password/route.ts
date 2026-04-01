import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { sendMail } from "@/lib/email";
import { wrapEmailBody } from "@/lib/emailTemplate";

/**
 * 관리자 비밀번호 초기화: PM/ADMIN만. 임시 비밀번호 설정 후 선택적으로 이메일 발송.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM", "ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const { id: employeeId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const temporaryPassword = String(body.temporaryPassword ?? "").trim();
  const sendEmail = !!body.sendEmail;

  if (!temporaryPassword || temporaryPassword.length < 8)
    return NextResponse.json({ error: "임시 비밀번호는 8자 이상이어야 합니다." }, { status: 400 });

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: true },
  });

  if (!employee)
    return NextResponse.json({ error: "사원을 찾을 수 없습니다." }, { status: 404 });
  if (!employee.user)
    return NextResponse.json({ error: "해당 사원은 아직 계정이 없습니다. 초대 후 회원가입을 완료해 주세요." }, { status: 400 });

  const hash = await bcrypt.hash(temporaryPassword, 10);
  await prisma.user.update({
    where: { id: employee.user.id },
    data: { passwordHash: hash, mustChangePassword: true },
  });

  if (sendEmail) {
    const to = employee.email?.trim() || "";
    if (!to) {
      return NextResponse.json({
        ok: true,
        message: "비밀번호가 초기화되었습니다. (이메일이 등록되어 있지 않아 메일을 발송하지 않았습니다. 임시 비밀번호를 직접 전달해 주세요.)",
      });
    }
    try {
      await sendMail({
        to,
        subject: "[GBIT Portal] 비밀번호 초기화 안내",
        text: `${employee.name}님, 관리자에 의해 비밀번호가 초기화되었습니다.\n\n임시 비밀번호: ${temporaryPassword}\n\n로그인 후 비밀번호 변경을 권장합니다.`,
        html: wrapEmailBody(`
          <p>${employee.name}님, 안녕하세요.</p>
          <p>관리자에 의해 비밀번호가 초기화되었습니다. 아래 <strong>임시 비밀번호</strong>로 로그인한 뒤, 비밀번호 변경을 권장합니다.</p>
          <p style="margin: 16px 0; padding: 12px; background:#f3f4f6; border-radius: 8px; font-family: monospace;">임시 비밀번호: <strong>${temporaryPassword}</strong></p>
          <p style="color:#6b7280;font-size:12px;">로그인 후 반드시 비밀번호를 변경해 주세요.</p>
        `, { title: "비밀번호 초기화 안내" }),
      });
    } catch (_) {
      // 초기화는 완료됐으므로 200 반환, 메시지로 이메일 실패 안내
      return NextResponse.json({
        ok: true,
        message: "비밀번호가 초기화되었습니다. 이메일 발송에 실패했을 수 있으니 임시 비밀번호를 직접 전달해 주세요.",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    message: sendEmail ? "비밀번호가 초기화되었고, 이메일로 임시 비밀번호를 발송했습니다." : "비밀번호가 초기화되었습니다. 임시 비밀번호를 사원에게 전달해 주세요.",
  });
}

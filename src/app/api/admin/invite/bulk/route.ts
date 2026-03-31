import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { v4 as uuid } from "uuid";
import { sendMail } from "@/lib/email";
import { wrapEmailBody } from "@/lib/emailTemplate";

type ResultRow = {
  employeeId: string;
  name: string;
  status: "SENT" | "SKIPPED" | "FAILED";
  reason?: string;
};

/** 여러 사원 초대 링크 발급 + 이메일 일괄 발송 (관리자 전용) */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds.map(String) : [];
  if (employeeIds.length === 0)
    return NextResponse.json({ error: "employeeIds가 필요합니다." }, { status: 400 });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const override = process.env.TEST_EMAIL_OVERRIDE?.trim();

  const emps = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    include: { user: { select: { id: true } } },
  });
  const byId = Object.fromEntries(emps.map((e) => [e.id, e]));

  const results: ResultRow[] = [];

  for (const employeeId of employeeIds) {
    const emp = byId[employeeId];
    if (!emp) {
      results.push({ employeeId, name: "-", status: "FAILED", reason: "사원을 찾을 수 없습니다." });
      continue;
    }
    if (emp.user) {
      results.push({ employeeId, name: emp.name, status: "SKIPPED", reason: "이미 계정이 있는 사원입니다." });
      continue;
    }
    if (!override && emp.emailEnabled === false) {
      results.push({ employeeId, name: emp.name, status: "SKIPPED", reason: "이메일 전송(수신) 미사용" });
      continue;
    }
    const to = override || emp.email?.trim() || "";
    if (!to) {
      results.push({ employeeId, name: emp.name, status: "SKIPPED", reason: "이메일 미등록" });
      continue;
    }

    const token = uuid();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const url = `${baseUrl}/register/${token}`;

    try {
      // 링크 발급(기존 미사용 토큰 만료 + 새 토큰 생성 + 상태 INVITED)
      await prisma.$transaction(async (tx) => {
        await tx.inviteToken.updateMany({
          where: { employeeId, usedAt: null },
          data: { expiresAt: new Date() },
        });
        await tx.inviteToken.create({ data: { employeeId, token, expiresAt } });
        await tx.employee.update({ where: { id: employeeId }, data: { status: "INVITED" } });
      });

      await sendMail({
        to,
        subject: `[GBIT Portal] 회원가입 초대 - ${emp.name}님`,
        text: `${emp.name}님, GBIT Portal 회원가입 초대입니다.\n\n아래 링크로 접속하여 아이디·비밀번호를 설정해 주세요.\n\n${url}\n\n※ 링크는 1회만 사용 가능하며, 7일 후 만료됩니다.`,
        html: wrapEmailBody(`
          <p>${emp.name}님, 안녕하세요.</p>
          <p>GBIT Portal 회원가입 초대 메일입니다. 아래 버튼으로 접속하여 <strong>아이디·비밀번호를 설정</strong>해 주세요.</p>
          <p style="margin: 20px 0;"><a href="${url}" style="display:inline-block; padding: 12px 24px; background:#1e40af; color:#fff; text-decoration:none; border-radius: 8px; font-weight: 600;">회원가입 하기</a></p>
          <p style="color:#6b7280;font-size:12px;">※ 링크는 1회만 사용 가능하며, 7일 후 만료됩니다.</p>
        `, { title: "회원가입 초대" }),
      });

      results.push({ employeeId, name: emp.name, status: "SENT" });
    } catch (e: any) {
      results.push({ employeeId, name: emp.name, status: "FAILED", reason: e?.message ?? "발송 실패" });
    }
  }

  const summary = {
    sent: results.filter((r) => r.status === "SENT").length,
    skipped: results.filter((r) => r.status === "SKIPPED").length,
    failed: results.filter((r) => r.status === "FAILED").length,
  };

  return NextResponse.json({ ok: true, summary, results });
}


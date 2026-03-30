import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getNextEmpNo } from "@/lib/empNo";
import { writeAudit, getIp } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { sendMail } from "@/lib/email";
import { wrapEmailBody } from "@/lib/emailTemplate";

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM","ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error:"권한 없음" }, { status:403 });

  const body = await req.json();
  const {
    empNo: empNoRaw,
    name,
    teamId,
    position,
    dutyDept,
    role,
    employeeType,
    hireDate,
    birthDate,
    phone,
    email,
    emailEnabled,
    alimtalkEnabled,
    accountProvision,
  } = body;
  if (!name||!position||!hireDate)
    return NextResponse.json({ error:"필수 항목 누락 (이름, 직급, 입사일)" }, { status:400 });

  const empNo = (empNoRaw && String(empNoRaw).trim()) || (await getNextEmpNo(prisma));
  const exists = await prisma.employee.findUnique({ where:{empNo} });
  if (exists) return NextResponse.json({ error:"이미 존재하는 사번입니다." }, { status:400 });

  const emp = await prisma.employee.create({
    data:{
      empNo, name, teamId:teamId||null, position, dutyDept:dutyDept||null, role:role||"STAFF",
      employeeType:employeeType||"FULL",
      hireDate:new Date(hireDate),
      birthDate:birthDate ? new Date(birthDate) : null,
      phone:phone||"",
      email:email||null,
      emailEnabled: !!emailEnabled,
      alimtalkEnabled: !!alimtalkEnabled,
    },
  });

  const modes = Array.isArray(accountProvision?.modes)
    ? (accountProvision.modes as string[])
    : [];
  const wantsDirect = modes.includes("DIRECT_CREDENTIAL");
  const wantsEmail = modes.includes("EMAIL_INVITE");
  let createdUsername: string | null = null;
  const notices: string[] = [];

  if (wantsDirect) {
    const existingUser = await prisma.user.findUnique({ where: { employeeId: emp.id } });
    if (existingUser) {
      notices.push("이미 계정이 있어 직접 발급은 건너뛰었습니다.");
    } else {
      const phoneDigits = String(phone ?? "").replace(/[^0-9]/g, "");
      const birthYmd = String(birthDate || "").replaceAll("-", "").trim();
      if (phoneDigits.length < 8) {
        notices.push("휴대폰번호가 없어 직접 발급을 건너뛰었습니다.");
      } else if (birthYmd.length !== 8) {
        notices.push("생년월일(8자리)이 없어 직접 발급을 건너뛰었습니다.");
      } else {
        const dupUser = await prisma.user.findUnique({
          where: { username: phoneDigits },
          select: { id: true },
        });
        if (dupUser) {
          notices.push(`아이디(${phoneDigits})가 이미 사용 중이라 직접 발급을 건너뛰었습니다.`);
        } else {
          const passwordHash = await bcrypt.hash(birthYmd, 12);
          await prisma.$transaction(async (tx) => {
            await tx.user.create({
              data: {
                employeeId: emp.id,
                username: phoneDigits,
                passwordHash,
                mustChangePassword: true,
              },
            });
            await tx.employee.update({ where: { id: emp.id }, data: { status: "ACTIVE" } });
          });
          createdUsername = phoneDigits;

          if (wantsEmail && emp.email) {
            try {
              await sendMail({
                to: emp.email,
                subject: "[GBIT Portal] 계정 생성 안내",
                text: `${emp.name}님 계정이 생성되었습니다.\n아이디: ${phoneDigits}\n초기 비밀번호: 생년월일 8자리\n첫 로그인 후 아이디/비밀번호 재설정이 필요합니다.`,
                html: wrapEmailBody(
                  `<p>${emp.name}님 계정이 생성되었습니다.</p>
                   <p>아이디: <strong>${phoneDigits}</strong><br/>초기 비밀번호: <strong>생년월일 8자리</strong></p>
                   <p>첫 로그인 후 아이디/비밀번호를 반드시 재설정해 주세요.</p>`,
                  { title: "계정 생성 안내" },
                ),
              });
            } catch {
              // 계정 생성은 완료됐으므로 메일 실패는 무시
            }
          }
        }
      }
    }
  } else if (wantsEmail) {
    const token = uuid();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.inviteToken.updateMany({
      where: { employeeId: emp.id, usedAt: null },
      data: { expiresAt: new Date() },
    });
    await prisma.inviteToken.create({ data: { employeeId: emp.id, token, expiresAt } });
    await prisma.employee.update({ where: { id: emp.id }, data: { status: "INVITED" } });
  }
  await writeAudit({
    entityType: "Employee",
    entityId: emp.id,
    action: "CREATED",
    actorId: user?.employeeId ?? null,
    after: { empNo: emp.empNo, name: emp.name },
    ip: getIp(req) ?? undefined,
  });
  return NextResponse.json({ ok:true, id:emp.id, createdUsername, notices });
}

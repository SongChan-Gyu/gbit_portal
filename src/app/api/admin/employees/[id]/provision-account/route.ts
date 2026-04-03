import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { ACCOUNT_PROVISION_REASON } from "@/lib/accountProvisionMeta";

type Method = "EMAIL_INVITE" | "DIRECT_CREDENTIAL";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const { id: employeeId } = await params;
  const body = await req.json().catch(() => ({}));
  const method = String(body?.method ?? "") as Method;
  if (!["EMAIL_INVITE", "DIRECT_CREDENTIAL"].includes(method)) {
    return NextResponse.json({ error: "계정 발급 방식이 올바르지 않습니다." }, { status: 400 });
  }

  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: true },
  });
  if (!emp) return NextResponse.json({ error: "사원을 찾을 수 없습니다." }, { status: 404 });

  if (method === "EMAIL_INVITE") {
    if (emp.user) return NextResponse.json({ error: ACCOUNT_PROVISION_REASON.ALREADY_HAS_ACCOUNT }, { status: 400 });
    const token = uuid();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.inviteToken.updateMany({
        where: { employeeId, usedAt: null },
        data: { expiresAt: new Date() },
      });
      await tx.inviteToken.create({ data: { employeeId, token, expiresAt } });
      await tx.employee.update({ where: { id: employeeId }, data: { status: "INVITED" } });
    });
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const url = `${baseUrl}/register/${token}`;
    return NextResponse.json({ ok: true, method, url, expiresAt: expiresAt.toISOString() });
  }

  if (emp.user) return NextResponse.json({ error: ACCOUNT_PROVISION_REASON.ALREADY_HAS_ACCOUNT }, { status: 400 });
  const phoneDigits = String(emp.phone ?? "").replace(/[^0-9]/g, "");
  const birthYmd = emp.birthDate
    ? `${emp.birthDate.getFullYear()}${String(emp.birthDate.getMonth() + 1).padStart(2, "0")}${String(emp.birthDate.getDate()).padStart(2, "0")}`
    : "";
  if (phoneDigits.length < 8) {
    return NextResponse.json({ error: ACCOUNT_PROVISION_REASON.PHONE_INVALID }, { status: 400 });
  }
  if (birthYmd.length !== 8) {
    return NextResponse.json({ error: ACCOUNT_PROVISION_REASON.BIRTHDATE_MISSING }, { status: 400 });
  }
  const dup = await prisma.user.findUnique({ where: { username: phoneDigits }, select: { id: true } });
  if (dup) {
    return NextResponse.json({ error: `아이디(${phoneDigits})가 이미 사용 중입니다.` }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(birthYmd, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        employeeId,
        username: phoneDigits,
        passwordHash,
        mustChangePassword: true,
      },
    });
    await tx.employee.update({ where: { id: employeeId }, data: { status: "ACTIVE" } });
  });
  return NextResponse.json({ ok: true, method, username: phoneDigits, tempPasswordHint: "생년월일 8자리" });
}


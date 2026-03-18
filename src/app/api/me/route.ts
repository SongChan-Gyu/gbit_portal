import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as any;

  const emp = await prisma.employee.findUnique({
    where: { id: u.employeeId },
    select: {
      id: true,
      empNo: true,
      name: true,
      phone: true,
      email: true,
      emailEnabled: true,
      alimtalkEnabled: true,
      team: { select: { name: true } },
      position: true,
    },
  });
  if (!emp) return NextResponse.json({ error: "사원 정보를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ ok: true, employee: emp });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as any;

  const body = await req.json().catch(() => ({}));
  const phone = body.phone != null ? String(body.phone).trim() : undefined;
  const email = body.email != null ? String(body.email).trim().toLowerCase() : undefined;
  const emailEnabled = body.emailEnabled != null ? !!body.emailEnabled : undefined;
  const alimtalkEnabled = body.alimtalkEnabled != null ? !!body.alimtalkEnabled : undefined;

  // 이메일을 켜려면 이메일 주소가 있어야 함
  if (emailEnabled === true) {
    const finalEmail = email ?? (await prisma.employee.findUnique({ where: { id: u.employeeId }, select: { email: true } }))?.email ?? "";
    if (!String(finalEmail).trim()) {
      return NextResponse.json({ error: "이메일 전송을 사용하려면 이메일을 먼저 입력해 주세요." }, { status: 400 });
    }
  }

  await prisma.employee.update({
    where: { id: u.employeeId },
    data: {
      ...(phone !== undefined ? { phone } : {}),
      ...(email !== undefined ? { email: email || null } : {}),
      ...(emailEnabled !== undefined ? { emailEnabled } : {}),
      ...(alimtalkEnabled !== undefined ? { alimtalkEnabled } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}


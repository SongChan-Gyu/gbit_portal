import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { emailEnabledSyncedToAddress } from "@/lib/employeeEmailPrefs";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as any;

  const emp = await prisma.employee.findUnique({
    where: { id: u.employeeId },
    select: {
      id: true,
      empNo: true,
      companyStaffNo: true,
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
  const me = await prisma.user.findUnique({
    where: { employeeId: u.employeeId },
    select: { mustChangePassword: true },
  });
  return NextResponse.json({ ok: true, employee: emp, mustChangePassword: !!me?.mustChangePassword });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const u = session.user as any;

  const body = await req.json().catch(() => ({}));
  const phone = body.phone != null ? String(body.phone).trim() : undefined;
  const emailRaw = body.email;
  const email =
    emailRaw !== undefined && emailRaw !== null
      ? String(emailRaw).trim().toLowerCase() || null
      : undefined;
  const alimtalkEnabled = body.alimtalkEnabled != null ? !!body.alimtalkEnabled : undefined;

  const existing = await prisma.employee.findUnique({
    where: { id: u.employeeId },
    select: { email: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "사원 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const nextEmail = email !== undefined ? email : existing.email;

  await prisma.employee.update({
    where: { id: u.employeeId },
    data: {
      ...(phone !== undefined ? { phone } : {}),
      ...(email !== undefined ? { email } : {}),
      emailEnabled: emailEnabledSyncedToAddress(nextEmail),
      ...(alimtalkEnabled !== undefined ? { alimtalkEnabled } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}


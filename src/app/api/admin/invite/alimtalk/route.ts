import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { v4 as uuid } from "uuid";
import { sendExternalInviteAlimtalk } from "@/lib/kakao";

/** 외부개발자 단건 알림톡 초대 — 토큰 발급 + 알림톡 발송 */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user);
  if (guard) return guard;

  const { employeeId } = await req.json();
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: { select: { id: true } } },
  });
  if (!emp) return NextResponse.json({ error: "사원 없음" }, { status: 404 });
  if (emp.user) return NextResponse.json({ error: "이미 계정이 있는 사원입니다." }, { status: 400 });

  const phone = emp.phone?.replace(/[^0-9]/g, "") ?? "";
  if (!phone) return NextResponse.json({ error: "연락처가 등록되지 않은 사원입니다." }, { status: 400 });

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

  let alimtalkStatus = "UNKNOWN";
  let alimtalkReason: string | undefined;
  try {
    const log = await prisma.notificationLog.findFirst({
      where: { targetId: { not: "" } },
      select: { id: true },
    });
    void log;
    await sendExternalInviteAlimtalk(prisma, employeeId, phone, emp.name, url, expiresAt);
    const lastLog = await prisma.notificationLog.findFirst({
      where: { targetId: employeeId, templateCode: "EXTERNAL_INVITE" },
      orderBy: { sentAt: "desc" },
      select: { status: true, errorMsg: true },
    });
    alimtalkStatus = lastLog?.status ?? "UNKNOWN";
    alimtalkReason = lastLog?.errorMsg ?? undefined;
  } catch (e: unknown) {
    alimtalkStatus = "FAILED";
    alimtalkReason = e instanceof Error ? e.message : "알림톡 발송 오류";
  }

  return NextResponse.json({ ok: true, url, expiresAt: expiresAt.toISOString(), alimtalkStatus, alimtalkReason });
}

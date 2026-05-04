import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { v4 as uuid } from "uuid";
import { sendExternalInviteAlimtalk } from "@/lib/kakao";

type ResultRow = {
  employeeId: string;
  name: string;
  status: "SENT" | "SKIPPED" | "FAILED";
  reason?: string;
};

/** 외부개발자 알림톡 초대 일괄 발송 */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds.map(String) : [];
  if (employeeIds.length === 0)
    return NextResponse.json({ error: "employeeIds가 필요합니다." }, { status: 400 });

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

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
    const phone = emp.phone?.replace(/[^0-9]/g, "") ?? "";
    if (!phone) {
      results.push({ employeeId, name: emp.name, status: "SKIPPED", reason: "연락처 미등록" });
      continue;
    }

    const token = uuid();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const url = `${baseUrl}/register/${token}`;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.inviteToken.updateMany({
          where: { employeeId, usedAt: null },
          data: { expiresAt: new Date() },
        });
        await tx.inviteToken.create({ data: { employeeId, token, expiresAt } });
        await tx.employee.update({ where: { id: employeeId }, data: { status: "INVITED" } });
      });

      await sendExternalInviteAlimtalk(prisma, employeeId, phone, emp.name, url, expiresAt);
      results.push({ employeeId, name: emp.name, status: "SENT" });
    } catch (e: unknown) {
      results.push({
        employeeId,
        name: emp.name,
        status: "FAILED",
        reason: e instanceof Error ? e.message : "발송 실패",
      });
    }
  }

  const summary = {
    sent: results.filter((r) => r.status === "SENT").length,
    skipped: results.filter((r) => r.status === "SKIPPED").length,
    failed: results.filter((r) => r.status === "FAILED").length,
  };

  return NextResponse.json({ ok: true, summary, results });
}

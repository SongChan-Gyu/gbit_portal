import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";

type ResultRow = {
  employeeId: string;
  name: string;
  status: "SENT" | "SKIPPED" | "FAILED";
  reason?: string;
  username?: string;
};

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? "")) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds.map(String) : [];
  if (employeeIds.length === 0) {
    return NextResponse.json({ error: "employeeIds가 필요합니다." }, { status: 400 });
  }

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

    const phoneDigits = String(emp.phone ?? "").replace(/[^0-9]/g, "");
    const birthYmd = emp.birthDate
      ? `${emp.birthDate.getFullYear()}${String(emp.birthDate.getMonth() + 1).padStart(2, "0")}${String(emp.birthDate.getDate()).padStart(2, "0")}`
      : "";
    if (phoneDigits.length < 8) {
      results.push({ employeeId, name: emp.name, status: "SKIPPED", reason: "휴대폰번호 미등록/형식오류" });
      continue;
    }
    if (birthYmd.length !== 8) {
      results.push({ employeeId, name: emp.name, status: "SKIPPED", reason: "생년월일 미등록" });
      continue;
    }

    try {
      const dup = await prisma.user.findUnique({ where: { username: phoneDigits }, select: { id: true } });
      if (dup) {
        results.push({ employeeId, name: emp.name, status: "FAILED", reason: `아이디(${phoneDigits}) 중복` });
        continue;
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
      results.push({ employeeId, name: emp.name, status: "SENT", username: phoneDigits });
    } catch (e: any) {
      results.push({ employeeId, name: emp.name, status: "FAILED", reason: e?.message ?? "직접 발급 실패" });
    }
  }

  const summary = {
    sent: results.filter((r) => r.status === "SENT").length,
    skipped: results.filter((r) => r.status === "SKIPPED").length,
    failed: results.filter((r) => r.status === "FAILED").length,
  };

  return NextResponse.json({ ok: true, summary, results });
}


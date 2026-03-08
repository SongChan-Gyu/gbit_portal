import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import type { ParsedEmployeeRow } from "@/lib/employeeExcel";

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const body = await req.json();
  const rows = body.rows as ParsedEmployeeRow[] | undefined;
  if (!Array.isArray(rows) || !rows.length)
    return NextResponse.json({ error: "등록할 데이터가 없습니다." }, { status: 400 });

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const teamByName = new Map(teams.map((t) => [t.name.trim(), t.id]));

  const created: string[] = [];
  const errors: { row: number; message: string }[] = [];

  for (const row of rows) {
    const existing = await prisma.employee.findUnique({ where: { empNo: row.empNo } });
    if (existing) {
      errors.push({ row: row._rowIndex, message: `사번 ${row.empNo} 이미 존재` });
      continue;
    }

    const teamId = row.team ? teamByName.get(row.team.trim()) ?? null : null;

    try {
      const emp = await prisma.employee.create({
        data: {
          empNo: row.empNo,
          name: row.name,
          teamId,
          position: row.position,
          dutyDept: row.dutyDept || null,
          role: row.role || "STAFF",
          employeeType: row.employeeType || "FULL",
          hireDate: new Date(row.hireDate),
          birthDate: row.birthDate ? new Date(row.birthDate) : null,
          phone: row.phone || "",
          email: row.email || null,
        },
      });
      created.push(emp.id);
    } catch (e: any) {
      errors.push({ row: row._rowIndex, message: e?.message ?? "저장 실패" });
    }
  }

  return NextResponse.json({
    ok: true,
    createdCount: created.length,
    errorCount: errors.length,
    errors,
    message: `${created.length}명 등록 완료${errors.length ? `, ${errors.length}건 실패` : ""}`,
  });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import type { ParsedEmployeeRow } from "@/lib/employeeExcel";
import { EXTERNAL_DEFAULT_HIRE_YMD } from "@/lib/employeeExcel";
import { emailEnabledSyncedToAddress } from "@/lib/employeeEmailPrefs";
import { normalizeCompanyStaffNo, ensureInternalUserFromCompanyStaffNo } from "@/lib/employeeCompanyStaffNo";

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const body = await req.json();
  const rows = body.rows as ParsedEmployeeRow[] | undefined;
  if (!Array.isArray(rows) || !rows.length)
    return NextResponse.json({ error: "등록할 데이터가 없습니다." }, { status: 400 });

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const teamByName = new Map(teams.map((t) => [t.name.trim(), t.id]));

  const created: string[] = [];
  const errors: { row: number; message: string }[] = [];
  let nextAutoNum = await getNextAutoNum(prisma);

  for (const row of rows) {
    let empNo = (row.empNo || "").trim();
    if (!empNo) {
      empNo = `E${String(nextAutoNum).padStart(3, "0")}`;
      nextAutoNum += 1;
    }
    const existing = await prisma.employee.findUnique({ where: { empNo } });
    if (existing) {
      errors.push({ row: row._rowIndex, message: `사번 ${empNo} 이미 존재` });
      continue;
    }

    const teamId = row.team ? teamByName.get(row.team.trim()) ?? null : null;

    const emailTrim = (row.email || "").trim();
    const emailNorm = emailTrim || null;
    const companyStaffNo = normalizeCompanyStaffNo(row.companyStaffNo ?? "");
    if (companyStaffNo) {
      const dupEmp = await prisma.employee.findUnique({ where: { companyStaffNo }, select: { id: true } });
      if (dupEmp) {
        errors.push({ row: row._rowIndex, message: `회사사번 ${companyStaffNo} 이미 존재` });
        continue;
      }
    }
    const rowType = row.employeeType || "FULL";
    const hireStr = (row.hireDate || "").trim();
    let hireDateObj: Date;
    if (rowType === "EXTERNAL" && !hireStr) {
      hireDateObj = new Date(`${EXTERNAL_DEFAULT_HIRE_YMD}T00:00:00`);
    } else {
      hireDateObj = new Date(hireStr);
    }
    if (Number.isNaN(hireDateObj.getTime())) {
      errors.push({ row: row._rowIndex, message: "입사일 형식이 올바르지 않습니다." });
      continue;
    }
    try {
      const emp = await prisma.$transaction(async (tx) => {
        const createdEmp = await tx.employee.create({
          data: {
            empNo,
            name: row.name,
            teamId,
            position: row.position,
            dutyDept: row.dutyDept || null,
            role: row.role || "STAFF",
            employeeType: rowType,
            hireDate: hireDateObj,
            birthDate: row.birthDate ? new Date(row.birthDate) : null,
            phone: row.phone || "",
            email: emailNorm,
            emailEnabled: emailEnabledSyncedToAddress(emailNorm),
            ...(companyStaffNo ? { companyStaffNo } : {}),
          },
        });
        if (companyStaffNo && rowType !== "EXTERNAL") {
          await ensureInternalUserFromCompanyStaffNo(tx, createdEmp.id, companyStaffNo);
        }
        return createdEmp;
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

async function getNextAutoNum(prisma: { employee: { findMany: (args: { select: { empNo: true } }) => Promise<{ empNo: string }[]> } }): Promise<number> {
  const employees = await prisma.employee.findMany({ select: { empNo: true } });
  let maxNum = 0;
  for (const e of employees) {
    const m = /^E(\d+)$/i.exec(e.empNo);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  return maxNum + 1;
}

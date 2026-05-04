import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { getNextEmpNo } from "@/lib/empNo";
import { writeAudit, getIp } from "@/lib/audit";
import { emailEnabledSyncedToAddress } from "@/lib/employeeEmailPrefs";
import { normalizeCompanyStaffNo, ensureInternalUserFromCompanyStaffNo } from "@/lib/employeeCompanyStaffNo";
import { EXTERNAL_DEFAULT_HIRE_YMD } from "@/lib/employeeExcel";

type EmployeePostBody = {
  empNo?: string;
  name: string;
  teamId?: string | null;
  position: string;
  dutyDept?: string | null;
  role?: string;
  employeeType?: string;
  hireDate: string;
  birthDate?: string | null;
  phone?: string;
  email?: string | null;
  alimtalkEnabled?: boolean;
  companyStaffNo?: string | null;
};

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

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
    alimtalkEnabled,
    companyStaffNo: companyStaffNoRaw,
  } = (await req.json()) as EmployeePostBody;
  const missing: string[] = [];
  const nameVal = String(name ?? "").trim();
  const positionVal = String(position ?? "").trim();
  const hireDateVal = String(hireDate ?? "").trim();
  const nextType = employeeType || "FULL";
  if (!nameVal) missing.push("이름");
  if (!positionVal) missing.push("직급");
  if (nextType !== "EXTERNAL" && (!hireDateVal || Number.isNaN(new Date(hireDateVal).getTime()))) {
    missing.push("입사일");
  }
  if (missing.length > 0) {
    return NextResponse.json({ error:`필수 항목 누락 (${missing.join(", ")})` }, { status:400 });
  }

  const hireResolved =
    nextType === "EXTERNAL" && !hireDateVal
      ? new Date(`${EXTERNAL_DEFAULT_HIRE_YMD}T00:00:00`)
      : new Date(hireDateVal);
  if (Number.isNaN(hireResolved.getTime())) {
    return NextResponse.json({ error: "입사일 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const empNo = (empNoRaw && String(empNoRaw).trim()) || (await getNextEmpNo(prisma));
  const exists = await prisma.employee.findUnique({ where:{empNo} });
  if (exists) return NextResponse.json({ error:"이미 존재하는 사번입니다." }, { status:400 });

  const companyStaffNo = normalizeCompanyStaffNo(
    companyStaffNoRaw !== undefined ? String(companyStaffNoRaw ?? "") : "",
  );
  if (companyStaffNo) {
    const dup = await prisma.employee.findUnique({ where: { companyStaffNo }, select: { id: true } });
    if (dup) return NextResponse.json({ error: "이미 사용 중인 회사사번입니다." }, { status: 400 });
  }

  const emailNorm = String(email ?? "").trim() || null;
  const emp = await prisma.$transaction(async (tx) => {
    const created = await tx.employee.create({
      data: {
        empNo,
        name,
        teamId: teamId || null,
        position,
        dutyDept: dutyDept || null,
        role: role || "STAFF",
        employeeType: nextType,
        hireDate: hireResolved,
        birthDate: birthDate ? new Date(birthDate) : null,
        phone: phone || "",
        email: emailNorm,
        emailEnabled: emailEnabledSyncedToAddress(emailNorm),
        alimtalkEnabled: !!alimtalkEnabled,
        ...(companyStaffNo ? { companyStaffNo } : {}),
      },
    });
    if (companyStaffNo && nextType !== "EXTERNAL") {
      await ensureInternalUserFromCompanyStaffNo(tx, created.id, companyStaffNo);
    }
    return created;
  });

  await writeAudit({
    entityType: "Employee",
    entityId: emp.id,
    action: "CREATED",
    actorId: user?.employeeId ?? null,
    after: { empNo: emp.empNo, name: emp.name },
    ip: getIp(req) ?? undefined,
  });
  return NextResponse.json({ ok:true, id:emp.id });
}

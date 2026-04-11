import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { getNextEmpNo } from "@/lib/empNo";
import { writeAudit, getIp } from "@/lib/audit";
import { emailEnabledSyncedToAddress } from "@/lib/employeeEmailPrefs";

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

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
    alimtalkEnabled,
  } = body;
  const missing: string[] = [];
  const nameVal = String(name ?? "").trim();
  const positionVal = String(position ?? "").trim();
  const hireDateVal = String(hireDate ?? "").trim();
  if (!nameVal) missing.push("이름");
  if (!positionVal) missing.push("직급");
  if (!hireDateVal || Number.isNaN(new Date(hireDateVal).getTime())) missing.push("입사일");
  if (missing.length > 0) {
    return NextResponse.json({ error:`필수 항목 누락 (${missing.join(", ")})` }, { status:400 });
  }

  const empNo = (empNoRaw && String(empNoRaw).trim()) || (await getNextEmpNo(prisma));
  const exists = await prisma.employee.findUnique({ where:{empNo} });
  if (exists) return NextResponse.json({ error:"이미 존재하는 사번입니다." }, { status:400 });

  const emailNorm = String(email ?? "").trim() || null;
  const emp = await prisma.employee.create({
    data:{
      empNo, name, teamId:teamId||null, position, dutyDept:dutyDept||null, role:role||"STAFF",
      employeeType:employeeType||"FULL",
      hireDate:new Date(hireDateVal),
      birthDate:birthDate ? new Date(birthDate) : null,
      phone:phone||"",
      email: emailNorm,
      emailEnabled: emailEnabledSyncedToAddress(emailNorm),
      alimtalkEnabled: !!alimtalkEnabled,
    },
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

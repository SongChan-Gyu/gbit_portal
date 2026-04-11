import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";
import { emailEnabledSyncedToAddress } from "@/lib/employeeEmailPrefs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const body = await req.json();
  const {
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
    status,
    alimtalkEnabled,
  } = body;

  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "사원을 찾을 수 없습니다." }, { status: 404 });

  const nextEmail = email !== undefined ? (String(email ?? "").trim() || null) : existing.email;
  const before = { name: existing.name, status: existing.status };
  await prisma.employee.update({
    where:{ id },
    data:{
      name, teamId:teamId||null, position, dutyDept:dutyDept||null, role,
      employeeType: employeeType||"FULL",
      hireDate:new Date(hireDate),
      birthDate:birthDate ? new Date(birthDate) : null,
      phone:phone||"",
      email: nextEmail,
      status,
      emailEnabled: emailEnabledSyncedToAddress(nextEmail),
      ...(alimtalkEnabled != null ? { alimtalkEnabled: !!alimtalkEnabled } : {}),
    },
  });
  await writeAudit({
    entityType: "Employee",
    entityId: id,
    action: "UPDATED",
    actorId: user?.employeeId ?? null,
    before: before ?? undefined,
    after: { name, status },
    ip: getIp(req) ?? undefined,
  });
  return NextResponse.json({ ok:true });
}

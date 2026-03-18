import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";

export async function PATCH(req: Request, { params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const session = await auth();
  const user = session?.user as any;
  if (!["PM","ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error:"권한 없음" }, { status:403 });

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
    emailEnabled,
    alimtalkEnabled,
  } = body;

  const before = await prisma.employee.findUnique({ where: { id }, select: { name: true, status: true } });
  await prisma.employee.update({
    where:{ id },
    data:{
      name, teamId:teamId||null, position, dutyDept:dutyDept||null, role,
      employeeType: employeeType||"FULL",
      hireDate:new Date(hireDate),
      birthDate:birthDate ? new Date(birthDate) : null,
      phone:phone||"",
      email:email||null,
      status,
      ...(emailEnabled != null ? { emailEnabled: !!emailEnabled } : {}),
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

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const session = await auth();
  const user = session?.user as any;
  if (!["PM","ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error:"권한 없음" }, { status:403 });

  const body = await req.json();
  const { name, teamId, position, dutyDept, role, employeeType, hireDate, birthDate, phone, email, status } = body;

  await prisma.employee.update({
    where:{ id },
    data:{
      name, teamId:teamId||null, position, dutyDept:dutyDept||null, role,
      employeeType: employeeType||"FULL",
      hireDate:new Date(hireDate), birthDate:birthDate ? new Date(birthDate) : null, phone:phone||"", email:email||null, status,
    },
  });
  return NextResponse.json({ ok:true });
}

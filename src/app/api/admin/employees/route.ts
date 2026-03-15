import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getNextEmpNo } from "@/lib/empNo";

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM","ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error:"권한 없음" }, { status:403 });

  const body = await req.json();
  const { empNo: empNoRaw, name, teamId, position, dutyDept, role, employeeType, hireDate, birthDate, phone, email } = body;
  if (!name||!position||!hireDate)
    return NextResponse.json({ error:"필수 항목 누락 (이름, 직급, 입사일)" }, { status:400 });

  const empNo = (empNoRaw && String(empNoRaw).trim()) || (await getNextEmpNo(prisma));
  const exists = await prisma.employee.findUnique({ where:{empNo} });
  if (exists) return NextResponse.json({ error:"이미 존재하는 사번입니다." }, { status:400 });

  const emp = await prisma.employee.create({
    data:{
      empNo, name, teamId:teamId||null, position, dutyDept:dutyDept||null, role:role||"STAFF",
      employeeType:employeeType||"FULL",
      hireDate:new Date(hireDate), birthDate:birthDate ? new Date(birthDate) : null, phone:phone||"", email:email||null,
    },
  });
  return NextResponse.json({ ok:true, id:emp.id });
}

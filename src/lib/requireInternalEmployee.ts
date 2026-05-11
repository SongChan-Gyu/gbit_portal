import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";

export type InternalSessionEmployee = {
  id: string;
  name: string;
  employeeType: string;
  role: string;
};

/** API: 내부 직원(비 EXTERNAL) 세션 조회. 실패 시 NextResponse, 성공 시 employee */
export async function getInternalEmployeeForApi(): Promise<
  | { ok: true; employee: InternalSessionEmployee; sessionUser: { employeeId: string; role: string; name: string } }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  const sessionUser = session.user as {
    employeeId: string;
    role: string;
    name: string;
  };
  const employee = await prisma.employee.findUnique({
    where: { id: sessionUser.employeeId },
    select: { id: true, name: true, employeeType: true, role: true },
  });
  if (!employee || employee.employeeType === "EXTERNAL") {
    return {
      ok: false,
      response: NextResponse.json({ error: "내부 직원만 이용할 수 있습니다." }, { status: 403 }),
    };
  }
  return {
    ok: true,
    employee: {
      id: employee.id,
      name: employee.name,
      employeeType: employee.employeeType,
      role: employee.role,
    },
    sessionUser,
  };
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";

/** 내부 직원 전용 페이지 진입. 외부개발자는 대시보드로. */
export async function requireInternalPageSession() {
  const session = await auth();
  if (!session) redirect("/login");
  const sessionUser = session.user as {
    employeeId: string;
    role: string;
    name: string;
  };
  const emp = await prisma.employee.findUnique({
    where: { id: sessionUser.employeeId },
    select: { id: true, employeeType: true, role: true, name: true },
  });
  if (!emp || emp.employeeType === "EXTERNAL") redirect("/dashboard");
  return { session, employee: emp };
}

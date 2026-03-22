import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { v4 as uuid } from "uuid";
import { forbidden, notFound } from "@/lib/apiError";

/** 운영 테스트 단계에서는 프로덕션에서도 사용. 정식 오픈 후 RESTRICT_TEST_BYPASS=true 로 제한 가능 */
const isBypassRestricted = process.env.RESTRICT_TEST_BYPASS === "true";

export async function POST(req: Request) {
  if (isBypassRestricted) {
    return forbidden("테스트 전용 API는 비활성화되어 있습니다.");
  }
  const session = await auth();
  const u = session?.user as any;
  if (!["PM","ADMIN"].includes(u?.role ?? ""))
    return forbidden("관리자 전용");

  const { employeeId } = await req.json();
  const emp = await prisma.employee.findUnique({ where:{ id:employeeId }, include:{ user:true } });
  if (!emp?.user) return notFound("계정이 없는 사원입니다.");

  const token = uuid();
  await prisma.testBypass.create({
    data: { employeeId, token, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  return NextResponse.json({ token });
}

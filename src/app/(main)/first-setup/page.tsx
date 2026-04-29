import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";

export const metadata = { title: "초기 계정 설정 | GBIT Portal" };

/** 예전 링크 호환: 아이디는 관리자·인사에서 확정되므로 비밀번호만 내 정보에서 변경합니다. */
export default async function FirstSetupPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const userId = (session.user as any)?.id as string | undefined;
  const employeeId = (session.user as any)?.employeeId as string | undefined;
  if (!userId && !employeeId) redirect("/login");

  const me = await prisma.user.findFirst({
    where: userId ? { id: userId } : { employeeId },
    select: { mustChangePassword: true },
  });
  if (!me) redirect("/login");
  if (!me.mustChangePassword) redirect("/dashboard");
  redirect("/me?forcePassword=1");
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import FirstSetupClient from "./FirstSetupClient";

export const metadata = { title: "초기 계정 설정 | GBIT Portal" };

export default async function FirstSetupPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const userId = (session.user as any)?.id as string | undefined;
  if (!userId) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, mustChangePassword: true },
  });
  if (!me) redirect("/login");
  if (!me.mustChangePassword) redirect("/dashboard");

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="page-title mb-2">초기 계정 설정</h1>
      <p className="page-subtitle mb-6">최초 접속이므로 아이디/비밀번호를 다시 설정해 주세요.</p>
      <FirstSetupClient initialUsername={me.username} />
    </div>
  );
}

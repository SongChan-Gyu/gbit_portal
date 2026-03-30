import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { redirect } from "next/navigation";
import MeClient from "./MeClient";

export const metadata = { title: "내 정보 | GBIT Portal" };

export default async function MePage({ searchParams }: { searchParams: Promise<{ forcePassword?: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const u = session.user as any;
  const { forcePassword } = await searchParams;

  const employee = await prisma.employee.findUnique({
    where: { id: u.employeeId },
    select: {
      id: true,
      empNo: true,
      name: true,
      phone: true,
      email: true,
      alimtalkEnabled: true,
      team: { select: { name: true } },
      position: true,
    },
  });
  if (!employee) redirect("/dashboard");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">내 정보</h1>
        <p className="page-subtitle">
          {forcePassword === "1" ? "초기 비밀번호 변경이 필요합니다." : "연락처·이메일·알림톡 수신 설정"}
        </p>
      </div>
      <MeClient initial={employee} forcePasswordChange={forcePassword === "1"} />
    </div>
  );
}


import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import JejuClient from "./JejuClient";

export const metadata = { title: "제주도 숙소 | GBIT Portal" };

export default async function JejuPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as any;
  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: { team: true },
  });
  const welfare = isWelfareDept(employee);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">제주도 숙소</h1>
        <p className="page-subtitle">
          이용일을 선택해 신청하세요. 선택한 날짜에 1박 이용(당일 입실, 다음 날 퇴실)이며 복지부 승인 후 이용할 수 있습니다.
        </p>
      </div>
      <JejuClient welfare={welfare} />
    </div>
  );
}

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
          달력에서 입실일을 클릭한 뒤 퇴실일을 클릭하세요. (1박 이상, 이미 예약된 기간과 겹칠 수 없습니다.) 선택 후 아래에서 상세 정보를 입력해 예약하기를 누르면 신청됩니다.
        </p>
      </div>
      <JejuClient welfare={welfare} />
    </div>
  );
}

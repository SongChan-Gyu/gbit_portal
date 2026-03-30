import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import StampApproveClient from "./StampApproveClient";
import { serializeDates } from "@/lib/serialize";

export default async function StampApprovePage({ searchParams }:{ searchParams: Promise<{ view?:string }> }) {
  const session = await auth();
  const user = session!.user as any;
  if (!["TEAM_LEAD","PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const self = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  });
  if (self?.employeeType === "EXTERNAL") redirect("/dashboard");

  const { view: viewRaw } = await searchParams;
  const view = viewRaw ?? "pending";

  const requests = await prisma.stampRequest.findMany({
    where: {
      approverId: user.employeeId,
      ...(view === "pending" ? { status: "PENDING" } : {}),
    },
    include: { employee: { include: { team: true } } },
    orderBy: { stampDate: "desc" },
  });

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">스탬프 서명 관리</h1>
          <p className="page-subtitle">운영 반영일 출근 스탬프 요청을 승인/반려합니다.</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {["pending","all"].map((v) => (
          <a key={v} href={`?view=${v}`}
            className={`btn-sm ${view === v ? "btn-primary" : "btn-secondary"}`}>
            {v === "pending" ? `대기 (${requests.filter((r) => r.status === "PENDING").length})` : "전체"}
          </a>
        ))}
      </div>

      <StampApproveClient requests={serializeDates(requests) as any} />
    </div>
  );
}

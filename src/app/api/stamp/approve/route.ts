import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const { id, action, comment } = await req.json() as {
    id: string; action: "APPROVE" | "REJECT"; comment?: string;
  };

  const sr = await prisma.stampRequest.findUnique({ where: { id }, include: { employee: true } });
  if (!sr) return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
  if (sr.status !== "PENDING") return NextResponse.json({ error: "이미 처리된 요청입니다." }, { status: 400 });

  const actor = await prisma.employee.findUnique({ where: { id: user.employeeId } });
  if (!["TEAM_LEAD","PM","ADMIN"].includes(actor?.role ?? ""))
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  if (action === "REJECT") {
    await prisma.stampRequest.update({
      where: { id },
      data: { status: "REJECTED", approvedAt: new Date(), comment: comment ?? null },
    });
    return NextResponse.json({ ok: true });
  }

  // APPROVE: 스탬프 쿠폰 자동 생성
  await prisma.$transaction(async (tx) => {
    const stamp = await tx.stampCoupon.create({
      data: {
        employeeId: sr.employeeId,
        stampDate: sr.stampDate,
      },
    });
    await tx.stampRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approverId: user.employeeId,
        stampId: stamp.id,
        comment: comment ?? null,
      },
    });
  });

  return NextResponse.json({ ok: true });
}

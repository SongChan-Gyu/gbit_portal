import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { appendStampCouponToCard } from "@/lib/stampCard";

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
  const guard = requirePMOrAdmin(actor); if (guard) return guard;

  if (action === "REJECT") {
    await prisma.stampRequest.update({
      where: { id },
      data: { status: "REJECTED", approvedAt: new Date(), comment: comment ?? null },
    });
    return NextResponse.json({ ok: true });
  }

  // APPROVE: 스탬프 칸(쿠폰)을 현재 장에 추가
  await prisma.$transaction(async (tx) => {
    const { stampId } = await appendStampCouponToCard(tx, sr.employeeId, sr.stampDate);
    await tx.stampRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approverId: user.employeeId,
        stampId,
        comment: comment ?? null,
      },
    });
  });

  return NextResponse.json({ ok: true });
}

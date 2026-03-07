import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const list = await prisma.jejuAccommodation.findMany({
    where: { employeeId: user.employeeId },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json(
    list.map((r) => ({
      id: r.id,
      startDate: r.startDate.toISOString().slice(0, 10),
      endDate: r.endDate.toISOString().slice(0, 10),
      nights: r.nights,
      reason: r.reason,
      status: r.status,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      rejectComment: r.rejectComment,
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
      cancelReason: r.cancelReason,
      createdAt: r.createdAt.toISOString(),
    }))
  );
}

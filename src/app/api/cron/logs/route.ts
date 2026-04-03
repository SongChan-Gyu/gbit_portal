import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const take   = Math.min(parseInt(searchParams.get("take") ?? "20"), 100);
  const jobName = searchParams.get("job") ?? undefined;

  const logs = await prisma.schedulerLog.findMany({
    where: jobName ? { jobName } : {},
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({ logs });
}

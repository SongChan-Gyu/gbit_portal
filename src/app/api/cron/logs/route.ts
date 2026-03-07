import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  if (!user || !["ADMIN","PM"].includes(user.role ?? "")) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

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

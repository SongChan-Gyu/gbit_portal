import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

const ALLOWED_KEYS = new Set(["leave_apply"]);

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await auth();
  const u = session?.user as { employeeId?: string } | undefined;
  if (!u?.employeeId) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const { key } = await ctx.params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "지원하지 않는 tourKey입니다." }, { status: 400 });
  }

  const row = await prisma.userFeatureTour.findUnique({
    where: { employeeId_tourKey: { employeeId: u.employeeId, tourKey: key } },
  });
  const seen = !!(row?.completedAt || row?.skippedAt);
  return NextResponse.json({ tourKey: key, seen });
}

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await auth();
  const u = session?.user as { employeeId?: string } | undefined;
  if (!u?.employeeId) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const { key } = await ctx.params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: "지원하지 않는 tourKey입니다." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action === "skip" ? "skip" : "complete";
  const now = new Date();

  await prisma.userFeatureTour.upsert({
    where: { employeeId_tourKey: { employeeId: u.employeeId, tourKey: key } },
    create: {
      employeeId: u.employeeId,
      tourKey: key,
      completedAt: action === "complete" ? now : null,
      skippedAt: action === "skip" ? now : null,
    },
    update: {
      completedAt: action === "complete" ? now : undefined,
      skippedAt: action === "skip" ? now : undefined,
    },
  });

  return NextResponse.json({ ok: true });
}

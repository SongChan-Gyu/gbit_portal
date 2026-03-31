import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

function normalizeUsername(input: unknown) {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const employeeId = (session.user as any)?.employeeId as string | undefined;
  if (!employeeId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const username = normalizeUsername(body?.username);
  if (username.length < 3) {
    return NextResponse.json(
      { ok: false, available: false, error: "아이디는 3자 이상이어야 합니다." },
      { status: 400 },
    );
  }

  const me = await prisma.user.findUnique({
    where: { employeeId },
    select: { id: true },
  });
  if (!me) return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });

  const exists = await prisma.user.findFirst({
    where: { username, NOT: { id: me.id } },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, available: !exists, normalizedUsername: username });
}

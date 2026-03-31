import { NextResponse } from "next/server";
import prisma from "@/lib/db";

function normalizeUsername(input: unknown) {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = normalizeUsername(body?.username);
  if (username.length < 3) {
    return NextResponse.json(
      { ok: false, available: false, error: "아이디는 3자 이상이어야 합니다." },
      { status: 400 },
    );
  }

  const exists = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, available: !exists, normalizedUsername: username });
}

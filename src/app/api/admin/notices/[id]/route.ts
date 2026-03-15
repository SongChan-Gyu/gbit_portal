import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const { id } = await ctx.params;
  const notice = await prisma.notice.findUnique({
    where: { id },
    include: { author: { select: { name: true } } },
  });
  if (!notice) return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(notice);
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM", "ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const { title, content } = body;
  if (!title || typeof content !== "string")
    return NextResponse.json({ error: "제목과 내용은 필수입니다." }, { status: 400 });

  const notice = await prisma.notice.update({
    where: { id },
    data: { title: String(title).trim(), content },
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json(notice);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM", "ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  const { id } = await ctx.params;
  await prisma.notice.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

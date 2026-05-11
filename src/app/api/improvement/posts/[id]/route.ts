import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getInternalEmployeeForApi } from "@/lib/requireInternalEmployee";
import { isPmOrAdmin } from "@/lib/internalRoles";

import { buildImprovementCommentTree } from "@/lib/improvementComments";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await getInternalEmployeeForApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const post = await prisma.improvementPost.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
  });
  if (!post) return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });

  const comments = await prisma.improvementComment.findMany({
    where: { postId: id },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    post,
    comments: buildImprovementCommentTree(comments),
  });
}

/** 상태 변경 (종료/재개): 작성자 또는 PM/ADMIN */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await getInternalEmployeeForApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const post = await prisma.improvementPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const status = String(body.status ?? "").toUpperCase();
  if (status !== "CLOSED" && status !== "OPEN") {
    return NextResponse.json({ error: "status는 OPEN 또는 CLOSED여야 합니다." }, { status: 400 });
  }

  const canModerate =
    post.authorId === gate.employee.id || isPmOrAdmin(gate.employee.role);
  if (!canModerate) {
    return NextResponse.json({ error: "이 글을 종료하거나 다시 열 권한이 없습니다." }, { status: 403 });
  }

  const updated = await prisma.improvementPost.update({
    where: { id },
    data:
      status === "CLOSED"
        ? {
            status: "CLOSED",
            closedAt: new Date(),
            closedById: gate.employee.id,
          }
        : {
            status: "OPEN",
            closedAt: null,
            closedById: null,
          },
  });

  return NextResponse.json({ ok: true, post: updated });
}

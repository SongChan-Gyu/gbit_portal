import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getInternalEmployeeForApi } from "@/lib/requireInternalEmployee";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await getInternalEmployeeForApi();
  if (!gate.ok) return gate.response;

  const { id: postId } = await ctx.params;
  const post = await prisma.improvementPost.findUnique({ where: { id: postId } });
  if (!post) return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
  if (post.status === "CLOSED") {
    return NextResponse.json({ error: "종료된 글에는 댓글을 달 수 없습니다." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  const parentId = body.parentId ? String(body.parentId) : null;

  if (text.length < 1) {
    return NextResponse.json({ error: "댓글 내용을 입력해 주세요." }, { status: 400 });
  }

  if (parentId) {
    const parent = await prisma.improvementComment.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.postId !== postId) {
      return NextResponse.json({ error: "잘못된 댓글 위치입니다." }, { status: 400 });
    }
    if (parent.parentId !== null) {
      return NextResponse.json(
        { error: "대댓글에는 다시 답글을 달 수 없습니다. (한 단계만)" },
        { status: 400 },
      );
    }
  }

  const comment = await prisma.improvementComment.create({
    data: {
      postId,
      parentId,
      authorId: gate.employee.id,
      body: text.slice(0, 20_000),
    },
  });

  // 목록 정렬용 updatedAt 갱신
  await prisma.improvementPost.update({
    where: { id: postId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, id: comment.id });
}

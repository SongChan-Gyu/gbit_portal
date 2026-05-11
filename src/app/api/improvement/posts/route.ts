import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getInternalEmployeeForApi } from "@/lib/requireInternalEmployee";

/** 목록 */
export async function GET(req: Request) {
  const gate = await getInternalEmployeeForApi();
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status"); // OPEN | CLOSED | ALL
  const where =
    statusFilter === "OPEN" || statusFilter === "CLOSED"
      ? { status: statusFilter }
      : {};

  const posts = await prisma.improvementPost.findMany({
    where,
    include: {
      author: { select: { id: true, name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ posts });
}

/** 새 글 */
export async function POST(req: Request) {
  const gate = await getInternalEmployeeForApi();
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (title.length < 2) {
    return NextResponse.json({ error: "제목을 2자 이상 입력해 주세요." }, { status: 400 });
  }
  if (text.length < 1) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }

  const post = await prisma.improvementPost.create({
    data: {
      authorId: gate.employee.id,
      title: title.slice(0, 200),
      body: text.slice(0, 50_000),
      status: "OPEN",
    },
  });

  return NextResponse.json({ ok: true, id: post.id });
}

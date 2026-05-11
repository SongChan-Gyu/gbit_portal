import { notFound } from "next/navigation";
import { requireInternalPageSession } from "@/lib/internalPageGuard";
import prisma from "@/lib/db";
import { buildImprovementCommentTree } from "@/lib/improvementComments";
import ImprovementDetailClient from "./ImprovementDetailClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await prisma.improvementPost.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: post ? `${post.title} | 개선·협의` : "개선·협의 | GBIT Portal" };
}

export default async function ImprovementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { employee } = await requireInternalPageSession();
  const { id } = await params;

  const post = await prisma.improvementPost.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
  });
  if (!post) notFound();

  const flat = await prisma.improvementComment.findMany({
    where: { postId: id },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const tree = buildImprovementCommentTree(flat);

  return (
    <ImprovementDetailClient
      initialPost={JSON.parse(JSON.stringify(post))}
      initialComments={JSON.parse(JSON.stringify(tree))}
      viewer={{ id: employee.id, role: employee.role }}
    />
  );
}

import Link from "next/link";
import { requireInternalPageSession } from "@/lib/internalPageGuard";
import prisma from "@/lib/db";
import { formatYMD } from "@/lib/dateUtils";

export const metadata = { title: "개선·협의 게시판 | GBIT Portal" };

export default async function ImprovementBoardPage() {
  await requireInternalPageSession();

  const posts = await prisma.improvementPost.findMany({
    include: {
      author: { select: { name: true } },
      _count: { select: { comments: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <div className="max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="page-title">개선·협의 게시판</h1>
          <p className="text-sm text-gray-500 mt-0.5 max-w-xl">
            기능 개선·불편·아이디어를 올리고, 댓글로 자유롭게 의견을 나눌 수 있습니다. (내부 직원 전용)
          </p>
        </div>
        <Link href="/improvement/new" className="btn-primary shrink-0 text-sm px-4 py-2.5 rounded-xl self-start">
          새 글 작성
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          아직 글이 없습니다. 첫 글을 작성해 보세요.
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                href={`/improvement/${p.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50/80 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900 line-clamp-2">{p.title}</span>
                    <p className="text-xs text-gray-500 mt-1">
                      {p.author.name} · {formatYMD(p.updatedAt)} · 댓글 {p._count.comments}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      p.status === "CLOSED"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {p.status === "CLOSED" ? "종료" : "진행"}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

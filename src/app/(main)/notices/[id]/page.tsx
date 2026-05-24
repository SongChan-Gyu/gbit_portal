import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import { formatYMD } from "@/lib/dateUtils";
import { sanitizeHtml } from "@/lib/sanitize";
import { employeeMatchesAudience } from "@/lib/audienceAccess";

export const metadata = { title: "공지사항 | GBIT Portal" };

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");
  const user = session.user as { employeeId: string };

  const { id } = await params;
  const notice = await prisma.notice.findUnique({
    where: { id },
    include: { author: { select: { name: true } } },
  });
  if (!notice) notFound();

  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  });
  const allowed = await employeeMatchesAudience(prisma, user.employeeId, emp?.employeeType, {
    audience: notice.audience,
    employeeGroupId: notice.employeeGroupId,
  });
  if (!allowed) notFound();

  return (
    <div className="max-w-3xl">
      <Link href="/notices" className="text-sm text-gray-500 hover:text-gray-700">
        ← 공지사항 목록
      </Link>
      <article className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <h1 className="text-xl font-semibold text-gray-800">{notice.title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {notice.author.name} · {formatYMD(notice.createdAt)}
          </p>
        </div>
        <div
          className="p-4 sm:p-6 prose prose-sm max-w-none text-gray-700 notice-content"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(notice.content) }}
        />
      </article>
    </div>
  );
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import { formatYMD } from "@/lib/dateUtils";

export const metadata = { title: "공지사항 관리 | GBIT Portal" };

export default async function AdminNoticesPage() {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? "")) redirect("/dashboard");

  const notices = await prisma.notice.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });

  return (
    <div className="max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">공지사항 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">PM·관리자만 공지 등록·수정할 수 있습니다.</p>
        </div>
        <Link href="/admin/notices/new" className="btn-primary text-sm py-2.5 px-4 rounded-lg font-medium inline-flex items-center justify-center shrink-0">
          + 공지 등록
        </Link>
      </div>
      {notices.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          등록된 공지가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {notices.map((n) => (
            <li key={n.id}>
              <div className="rounded-lg border border-gray-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <Link href={`/notices/${n.id}`} className="font-medium text-gray-800 hover:underline">{n.title}</Link>
                  <p className="text-xs text-gray-500 mt-0.5">{n.author.name} · {formatYMD(n.createdAt)}</p>
                </div>
                <Link href={`/admin/notices/${n.id}/edit`} className="text-sm text-blue-600 hover:text-blue-800 shrink-0">수정</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

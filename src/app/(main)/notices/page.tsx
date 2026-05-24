import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import { formatYMD } from "@/lib/dateUtils";
import { audienceVisibleOrClause } from "@/lib/audienceAccess";

export const metadata = { title: "공지사항 | GBIT Portal" };

export default async function NoticesPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const user = session.user as { employeeId: string };

  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  });
  const isExternal = emp?.employeeType === "EXTERNAL";

  const notices = await prisma.notice.findMany({
    where: audienceVisibleOrClause(user.employeeId, isExternal),
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true } } },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="page-title">공지사항</h1>
      <p className="text-sm text-gray-500 mt-0.5">회사 공지사항을 확인하세요.</p>

      {notices.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          등록된 공지가 없습니다.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {notices.map((n) => (
            <li key={n.id}>
              <Link
                href={`/notices/${n.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:bg-gray-50 transition"
              >
                <span className="font-medium text-gray-800">{n.title}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {n.author.name} · {formatYMD(n.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

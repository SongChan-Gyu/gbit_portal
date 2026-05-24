import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { formatYMD } from "@/lib/dateUtils";
import { audienceLabel } from "@/lib/audienceAccess";

export const metadata = { title: "로그인 팝업 | GBIT Portal" };

export default async function LoginAnnouncementsAdminPage() {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  if (!["PM", "ADMIN"].includes(user?.role ?? "")) redirect("/dashboard");

  const list = await prisma.loginAnnouncement.findMany({
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    include: {
      author: { select: { name: true } },
      employeeGroup: { select: { name: true } },
    },
  });

  return (
    <div className="max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">로그인 팝업</h1>
          <p className="text-sm text-gray-500 mt-0.5">로그인 후 대상 직원에게 표시되는 공지 팝업을 관리합니다.</p>
        </div>
        <Link href="/admin/login-announcements/new" className="btn-primary text-sm py-2.5 px-4 rounded-lg font-medium inline-flex shrink-0">
          + 팝업 등록
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">등록된 팝업이 없습니다.</div>
      ) : (
        <ul className="space-y-2">
          {list.map((row) => (
            <li key={row.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{row.title}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${row.isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                      {row.isActive ? "활성" : "비활성"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {audienceLabel(row.audience, row.employeeGroup?.name)} · 우선순위 {row.priority} · {row.author.name} · {formatYMD(row.createdAt)}
                  </p>
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2 whitespace-pre-wrap">{row.body}</p>
                </div>
                <Link href={`/admin/login-announcements/${row.id}/edit`} className="text-sm text-indigo-600 hover:text-indigo-800 shrink-0 font-medium">
                  수정
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

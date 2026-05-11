import Link from "next/link";
import { requireInternalPageSession } from "@/lib/internalPageGuard";
import prisma from "@/lib/db";
import { formatYMD } from "@/lib/dateUtils";
import { isPmOrAdmin } from "@/lib/internalRoles";

export const metadata = { title: "1:1 문의 | GBIT Portal" };

export default async function SupportListPage() {
  const { employee } = await requireInternalPageSession();
  const staff = isPmOrAdmin(employee.role);

  const tickets = await prisma.supportTicket.findMany({
    where: staff ? {} : { employeeId: employee.id },
    include: {
      employee: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 150,
  });

  return (
    <div className="max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="page-title">1:1 문의</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {staff
              ? "내부 직원 문의 목록입니다. 티켓을 열어 답변할 수 있습니다."
              : "계정·시스템 문제 등은 여기에 남겨 주세요. 운영자(PM/관리자)에게만 공개됩니다."}
          </p>
        </div>
        <Link href="/support/new" className="btn-primary shrink-0 text-sm px-4 py-2.5 rounded-xl self-start">
          새 문의
        </Link>
      </div>

      {tickets.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          문의가 없습니다.
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/support/${t.id}`}
                className="block rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50/80 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900 line-clamp-2">{t.subject}</span>
                    <p className="text-xs text-gray-500 mt-1">
                      {staff && <span className="text-gray-600">{t.employee.name} · </span>}
                      최근 {formatYMD(t.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      t.status === "CLOSED" ? "bg-gray-100 text-gray-600" : "bg-blue-50 text-blue-800"
                    }`}
                  >
                    {t.status === "CLOSED" ? "종료" : "진행"}
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

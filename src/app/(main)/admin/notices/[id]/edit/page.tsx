import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import NoticeEditor from "../../NoticeEditor";

export const metadata = { title: "공지 수정 | GBIT Portal" };

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? "")) redirect("/dashboard");

  const { id } = await params;
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) redirect("/admin/notices");

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/admin/notices" className="text-sm text-gray-500 hover:text-gray-700">
          ← 공지사항 관리
        </Link>
        <h1 className="page-title mt-2">공지 수정</h1>
      </div>
      <NoticeEditor
        noticeId={notice.id}
        initialTitle={notice.title}
        initialContent={notice.content}
      />
    </div>
  );
}

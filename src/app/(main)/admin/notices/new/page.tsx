import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import NoticeEditor from "../NoticeEditor";

export const metadata = { title: "공지 등록 | GBIT Portal" };

export default async function NewNoticePage() {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? "")) redirect("/dashboard");

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/admin/notices" className="text-sm text-gray-500 hover:text-gray-700">← 공지사항 관리</Link>
        <h1 className="page-title mt-2">공지 등록</h1>
      </div>
      <NoticeEditor />
    </div>
  );
}

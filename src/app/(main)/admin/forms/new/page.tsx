import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import FormBuilder from "../FormBuilder";

export const metadata = { title: "양식 만들기 | GBIT Portal" };

export default async function NewFormPage() {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? "") && !user?.isSettingsAdmin) redirect("/dashboard");

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/admin/forms" className="text-sm text-gray-500 hover:text-gray-700">
          ← 양식 관리
        </Link>
        <h1 className="page-title mt-2">양식 만들기</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          제목과 URL 경로를 정한 뒤, 질문/필드를 추가하세요. 콤보는 선택 항목을 한 줄에 하나씩 입력합니다.
        </p>
      </div>
      <FormBuilder formId={null} />
    </div>
  );
}

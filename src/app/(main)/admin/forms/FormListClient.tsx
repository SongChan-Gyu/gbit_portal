"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, FileText, Trash2, Copy, ExternalLink } from "lucide-react";

type FormWithCount = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  _count: { submissions: number };
  fields: { id: string; label: string }[];
};

export default function FormListClient({ forms }: { forms: FormWithCount[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  const formPagePath = (slug: string) => `/f/${slug}`;
  const fullFormUrl = (slug: string) =>
    typeof window !== "undefined" ? `${window.location.origin}/f/${slug}` : "";

  async function handleDelete(id: string) {
    if (!confirm("이 양식을 삭제하면 제출된 내용도 모두 삭제됩니다. 계속할까요?")) return;
    setDeleting(id);
    const res = await fetch(`/api/admin/forms/${id}`, { method: "DELETE" });
    setDeleting(null);
    if (res.ok) router.refresh();
    else alert((await res.json()).error ?? "삭제 실패");
  }

  if (forms.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
        등록된 양식이 없습니다. &quot;양식 만들기&quot;로 첫 양식을 추가하세요.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {forms.map((f) => (
        <li
          key={f.id}
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800">{f.title}</span>
              {!f.isActive && (
                <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">비활성</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              /f/{f.slug} · 필드 {f.fields.length}개 · 제출 {f._count.submissions}건
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={formPagePath(f.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="w-4 h-4" /> 미리보기
            </a>
            <button
              type="button"
              onClick={() => {
                const url = fullFormUrl(f.slug);
                if (url) {
                  navigator.clipboard.writeText(url);
                  alert("링크가 복사되었습니다: " + url);
                }
              }}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
            >
              <Copy className="w-4 h-4" /> 링크 복사
            </button>
            <Link
              href={`/admin/forms/${f.id}/submissions`}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
            >
              <FileText className="w-4 h-4" /> 제출 목록
            </Link>
            <Link
              href={`/admin/forms/${f.id}/edit`}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
            >
              <Pencil className="w-4 h-4" /> 수정
            </Link>
            <button
              type="button"
              onClick={() => handleDelete(f.id)}
              disabled={deleting === f.id}
              className="inline-flex items-center gap-1 text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> 삭제
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

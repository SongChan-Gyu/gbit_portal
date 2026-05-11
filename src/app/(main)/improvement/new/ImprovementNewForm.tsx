"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ImprovementNewForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await fetch("/api/improvement/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr(data.error ?? "저장에 실패했습니다.");
      return;
    }
    router.push(`/improvement/${data.id}`);
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <Link href="/improvement" className="text-sm text-blue-600 hover:underline">
        ← 목록
      </Link>
      <h1 className="page-title mt-3">새 글 작성</h1>
      <p className="text-sm text-gray-500 mt-0.5">
        개선 제안·토론 주제를 구체적으로 적어 주시면 동료들이 참여하기 좋습니다.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div>
          <label className="label">제목</label>
          <input
            className="input w-full"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 휴가 신청 화면에서 …"
            maxLength={200}
            required
          />
        </div>
        <div>
          <label className="label">내용</label>
          <textarea
            className="input w-full min-h-[200px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="배경, 기대 효과, 참고 화면 등을 자유롭게 작성해 주세요."
            required
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-primary px-5 py-2.5 rounded-xl" disabled={loading}>
            {loading ? "등록 중…" : "등록"}
          </button>
          <Link href="/improvement" className="btn-secondary px-5 py-2.5 rounded-xl">
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}

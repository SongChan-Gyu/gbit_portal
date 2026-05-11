"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SupportNewForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr(data.error ?? "접수에 실패했습니다.");
      return;
    }
    router.push(`/support/${data.id}`);
    router.refresh();
  }

  return (
    <div className="max-w-2xl">
      <Link href="/support" className="text-sm text-blue-600 hover:underline">
        ← 목록
      </Link>
      <h1 className="page-title mt-3">새 1:1 문의</h1>
      <p className="text-sm text-gray-500 mt-0.5">증상·메뉴 경로·에러 메시지를 적어 주시면 처리가 빨라집니다.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div>
          <label className="label">제목</label>
          <input
            className="input w-full"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
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
            required
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-primary px-5 py-2.5 rounded-xl" disabled={loading}>
            {loading ? "접수 중…" : "접수"}
          </button>
          <Link href="/support" className="btn-secondary px-5 py-2.5 rounded-xl">
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}

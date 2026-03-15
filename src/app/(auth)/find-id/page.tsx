"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, User } from "lucide-react";

export default function FindIdPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/auth/find-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) setMessage({ type: "err", text: data.error });
    else setMessage({ type: "ok", text: data.message ?? "등록된 이메일로 아이디를 발송했습니다." });
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">아이디 찾기</h1>
            <p className="text-sm text-gray-500 mt-1">가입 시 등록한 이름과 이메일을 입력하세요.</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">이름</label>
              <div className="relative">
                <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" required />
              </div>
            </div>
            <div>
              <label className="label">이메일</label>
              <div className="relative">
                <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="email" className="input pl-8" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="이메일" required />
              </div>
            </div>
            {message && (
              <div className={`text-sm rounded px-3 py-2 ${message.type === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {message.text}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? "처리 중..." : "아이디 발송"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500">
            <Link href="/login" className="text-blue-600 hover:underline">로그인</Link>
            {" · "}
            <Link href="/forgot-password" className="text-blue-600 hover:underline">비밀번호 찾기</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setMessage({ type: "err", text: "재설정 링크가 올바르지 않습니다. 비밀번호 찾기를 다시 시도해 주세요." });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setMessage({ type: "err", text: "비밀번호가 일치하지 않습니다." });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: "err", text: "비밀번호는 8자 이상이어야 합니다." });
      return;
    }
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.error) setMessage({ type: "err", text: data.error });
    else {
      setMessage({ type: "ok", text: data.message ?? "비밀번호가 변경되었습니다." });
      setDone(true);
    }
  }

  if (!token)
    return (
      <div className="min-h-screen flex bg-gray-50 items-center justify-center px-6">
        <div className="text-center">
          <p className="text-red-600 mb-4">재설정 링크가 올바르지 않습니다.</p>
          <Link href="/forgot-password" className="text-blue-600 hover:underline">비밀번호 찾기</Link>
        </div>
      </div>
    );

  if (done)
    return (
      <div className="min-h-screen flex bg-gray-50 items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-green-700 font-medium mb-4">비밀번호가 변경되었습니다.</p>
          <Link href="/login" className="btn-primary inline-block py-2.5 px-6">로그인</Link>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen flex bg-gray-50">
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">비밀번호 재설정</h1>
            <p className="text-sm text-gray-500 mt-1">새 비밀번호를 입력하세요. (8자 이상)</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">새 비밀번호</label>
              <div className="relative">
                <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="password" className="input pl-8" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="8자 이상" minLength={8} required />
              </div>
            </div>
            <div>
              <label className="label">비밀번호 확인</label>
              <div className="relative">
                <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="password" className="input pl-8" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="다시 입력" minLength={8} required />
              </div>
            </div>
            {message && (
              <div className={`text-sm rounded px-3 py-2 ${message.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-600"} border ${message.type === "ok" ? "border-green-200" : "border-red-200"}`}>
                {message.text}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? "처리 중..." : "비밀번호 변경"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-500">
            <Link href="/login" className="text-blue-600 hover:underline">로그인</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex bg-gray-50 items-center justify-center">
        <p className="text-gray-500">불러오는 중...</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}

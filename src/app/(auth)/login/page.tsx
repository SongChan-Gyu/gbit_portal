"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AlertCircle, Lock, Sparkles, User } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await signIn("credentials", { username, password, redirect: false });
    setLoading(false);
    if (res?.error) setError("아이디 또는 비밀번호가 올바르지 않습니다.");
    else {
      try {
        const meRes = await fetch("/api/me");
        const me = await meRes.json().catch(() => ({}));
        if (meRes.ok && me?.mustChangePassword) {
          router.push("/first-setup");
          return;
        }
      } catch {}
      router.push("/dashboard");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-16 -left-10 w-64 h-64 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute top-1/3 -right-10 w-72 h-72 rounded-full bg-indigo-200/25 blur-3xl" />
      </div>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12 min-h-screen flex items-center">
        <div className="w-full grid lg:grid-cols-2 gap-6 lg:gap-8 items-stretch">
          <div className="hidden lg:flex rounded-3xl bg-gradient-to-br from-blue-700 to-indigo-800 p-10 text-white shadow-2xl">
            <div className="flex h-full flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
                  <Sparkles size={14} />
                  GBIT Portal
                </div>
                <h2 className="mt-5 text-3xl font-black tracking-tight leading-tight">
                  업무와 휴가를
                  <br />
                  더 간편하게
                </h2>
                <p className="mt-3 text-sm text-blue-100">연차/결재/제주숙소/스탬프를 한 곳에서 관리합니다.</p>
              </div>
              <div className="space-y-3 text-sm text-blue-100">
                {[
                  "연차·반차 신청 및 결재",
                  "제주도 숙소 예약·승인",
                  "스탬프 쿠폰 및 월별 근태 현황",
                ].map((f) => (
                  <p key={f} className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-200 inline-block" />
                    {f}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl sm:rounded-3xl border border-white/70 bg-white/92 backdrop-blur p-5 sm:p-8 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            <div className="mb-6 sm:mb-8">
              <p className="text-xs font-semibold tracking-wide text-blue-700">WELCOME BACK</p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-1">로그인</h1>
              <p className="text-sm text-gray-500 mt-1.5">계정 정보를 입력해 포털에 접속하세요.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">아이디</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="input pl-9 h-11 sm:h-12 rounded-xl"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="아이디 입력"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="label">비밀번호</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    className="input pl-9 h-11 sm:h-12 rounded-xl"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  <AlertCircle size={14} className="shrink-0" />
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full h-11 sm:h-12 rounded-xl justify-center mt-2 text-sm sm:text-base shadow-sm">
                {loading ? <><span className="spinner" /><span>로그인 중</span></> : "로그인"}
              </button>
              <p className="mt-3 text-center text-sm text-gray-500">
                <a href="/find-id" className="text-blue-600 hover:underline">아이디 찾기</a>
                {" · "}
                <a href="/forgot-password" className="text-blue-600 hover:underline">비밀번호 찾기</a>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

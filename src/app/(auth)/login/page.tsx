"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AlertCircle, Lock, User } from "lucide-react";

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
    else router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* 좌측 브랜딩 패널 — 데스크톱만 */}
      <div className="hidden lg:flex flex-col justify-between w-96 bg-blue-700 px-10 py-12 text-white">
        <div>
          <div className="text-2xl font-black tracking-tight mb-1">GBIT Portal</div>
          <p className="text-blue-200 text-sm">지비아이티 포털</p>
        </div>
        <div className="space-y-4 text-sm text-blue-100">
          <p className="font-semibold text-white text-base">주요 기능</p>
          {[
            "연차·반차 신청 및 결재 (팀장·PM 결재)",
            "제주도 숙소 예약·신청 (입실·퇴실 선택, 복지부 승인)",
            "스탬프 쿠폰 (힐링데이·오후인정)",
            "월간 근태 현황",
            "조직·사원 관리 (엑셀 일괄 등록)",
          ].map((f) => (
            <p key={f} className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-blue-300 inline-block"/>
              {f}
            </p>
          ))}
        </div>
        <p className="text-xs text-blue-300">© 2025 GBIT Portal</p>
      </div>

      {/* 우측 로그인 폼 */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-xl font-bold text-gray-900">로그인</h1>
            <p className="text-sm text-gray-500 mt-1">계정 정보를 입력하여 로그인하세요.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">아이디</label>
              <div className="relative">
                <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="input pl-8"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="아이디 입력"
                  autoComplete="username"
                  required />
              </div>
            </div>
            <div>
              <label className="label">비밀번호</label>
              <div className="relative">
                <Lock size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  className="input pl-8"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                  autoComplete="current-password"
                  required />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full btn-lg justify-center mt-2">
              {loading ? <><span className="spinner" /><span>로그인 중</span></> : "로그인"}
            </button>
            <p className="mt-3 text-center text-sm text-gray-500">
              <a href="/find-id" className="text-blue-600 hover:underline">아이디 찾기</a>
              {" · "}
              <a href="/forgot-password" className="text-blue-600 hover:underline">비밀번호 찾기</a>
            </p>
          </form>

          <div className="mt-6 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-500 space-y-1">
            <p className="font-medium text-gray-600">테스트 계정</p>
            <p>admin / admin1234! &nbsp;·&nbsp; pm / password1!</p>
            <p>team1 / password1! &nbsp;·&nbsp; staff1 / password1!</p>
          </div>
        </div>
      </div>
    </div>
  );
}

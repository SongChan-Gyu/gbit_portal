"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, Check, AlertCircle } from "lucide-react";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8자 이상", ok: password.length >= 8 },
    { label: "숫자 포함", ok: /\d/.test(password) },
    { label: "영문 포함", ok: /[a-zA-Z]/.test(password) },
    { label: "특수문자 포함", ok: /[!@#$%^&*]/.test(password) },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const colors = ["bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-green-500"];

  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < passed ? colors[passed - 1] : "bg-gray-200"}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {checks.map((c) => (
          <div key={c.label} className={`flex items-center gap-1 text-[11px] ${c.ok ? "text-green-600" : "text-gray-400"}`}>
            <Check size={10} className={c.ok ? "opacity-100" : "opacity-30"} />
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RegisterForm({ token, employeeId }: { token: string; employeeId: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const pwMatch = confirm.length > 0 && password === confirm;
  const pwMismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (password !== confirm) { setError("비밀번호가 일치하지 않습니다."); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, username, password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "등록 실패"); setLoading(false); return; }
    const result = await signIn("credentials", { username, password, redirect: false });
    if (result?.error) { setError("로그인 실패. 다시 시도해 주세요."); setLoading(false); return; }
    router.push("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 아이디 */}
      <div>
        <label className="label">아이디 <span className="text-red-400">*</span></label>
        <input
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="영문·숫자 조합 (3자 이상)"
          minLength={3}
          maxLength={30}
          pattern="[a-zA-Z0-9_]+"
          title="영문, 숫자, 언더스코어만 사용 가능"
          required
          autoComplete="username"
        />
        <p className="text-xs text-gray-400 mt-1">영문, 숫자, _ 만 사용 가능합니다.</p>
      </div>

      {/* 비밀번호 */}
      <div>
        <label className="label">비밀번호 <span className="text-red-400">*</span></label>
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            className="input pr-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8자 이상"
            minLength={8}
            required
            autoComplete="new-password"
          />
          <button type="button" tabIndex={-1}
            onClick={() => setShowPw((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <PasswordStrength password={password} />
      </div>

      {/* 비밀번호 확인 */}
      <div>
        <label className="label">비밀번호 확인 <span className="text-red-400">*</span></label>
        <div className="relative">
          <input
            type={showConfirm ? "text" : "password"}
            className={`input pr-10 ${pwMismatch ? "border-red-300 ring-1 ring-red-200" : pwMatch ? "border-green-300 ring-1 ring-green-200" : ""}`}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="비밀번호 재입력"
            required
            autoComplete="new-password"
          />
          <button type="button" tabIndex={-1}
            onClick={() => setShowConfirm((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {pwMatch && (
          <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><Check size={11} /> 비밀번호가 일치합니다.</p>
        )}
        {pwMismatch && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={11} /> 비밀번호가 일치하지 않습니다.</p>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className="btn-primary w-full btn-lg" disabled={loading || pwMismatch}>
        {loading ? (
          <><span className="spinner" /><span>등록 중...</span></>
        ) : (
          "계정 등록하기"
        )}
      </button>
    </form>
  );
}

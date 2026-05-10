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

export default function RegisterForm({
  token,
  employeeId,
  existingEmail = "",
}: {
  token: string;
  employeeId: string;
  existingEmail?: string;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState(existingEmail);
  const [alimtalkEnabled, setAlimtalkEnabled] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [usernameCheckMsg, setUsernameCheckMsg] = useState("");
  const [usernameChecked, setUsernameChecked] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const pwMatch = confirm.length > 0 && password === confirm;
  const pwMismatch = confirm.length > 0 && password !== confirm;

  async function checkUsernameDuplication() {
    setCheckingUsername(true);
    setUsernameCheckMsg("");
    const res = await fetch("/api/auth/check-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const data = await res.json().catch(() => ({}));
    setCheckingUsername(false);
    if (!res.ok) {
      setUsernameChecked(false);
      setUsernameCheckMsg(data.error ?? "중복 확인에 실패했습니다.");
      return;
    }
    if (data?.normalizedUsername && data.normalizedUsername !== username) {
      setUsername(data.normalizedUsername);
    }
    if (data.available) {
      setUsernameChecked(true);
      setUsernameCheckMsg("사용 가능한 아이디입니다.");
    } else {
      setUsernameChecked(false);
      setUsernameCheckMsg("이미 사용 중인 아이디입니다.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!usernameChecked) { setError("아이디 중복 확인을 먼저 해주세요."); return; }
    if (password.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (password !== confirm) { setError("비밀번호가 일치하지 않습니다."); return; }
    if (!email.trim()) { setError("이메일 주소를 입력해 주세요."); return; }
    setLoading(true); setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, username, password, email: email.trim(), alimtalkEnabled }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "등록 실패"); setLoading(false); return; }
    const result = await signIn("credentials", { username, password, redirect: false });
    if (result?.error) { setError("로그인 실패. 다시 시도해 주세요."); setLoading(false); return; }
    router.push("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 이메일 */}
      <div>
        <label className="label">이메일 <span className="text-red-400">*</span></label>
        <input
          type="email"
          className="input w-full"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@email.com"
          required
          autoComplete="email"
        />
        <p className="text-xs text-gray-400 mt-1">아이디·비밀번호 찾기에 사용됩니다.</p>
      </div>

      {/* 아이디 */}
      <div>
        <label className="label">아이디 <span className="text-red-400">*</span></label>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameChecked(false);
              setUsernameCheckMsg("");
            }}
            placeholder="영문·숫자 조합 (3자 이상)"
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_]+"
            title="영문, 숫자, 언더스코어만 사용 가능"
            required
            autoComplete="username"
          />
          <button
            type="button"
            onClick={checkUsernameDuplication}
            disabled={checkingUsername || username.trim().length < 3}
            className="btn-outline whitespace-nowrap px-3"
          >
            {checkingUsername ? "확인 중..." : "중복 확인"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">영문, 숫자, _ 만 사용 가능합니다.</p>
        {!!usernameCheckMsg && (
          <p className={`text-xs mt-1 ${usernameChecked ? "text-green-600" : "text-red-500"}`}>
            {usernameCheckMsg}
          </p>
        )}
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
        <p className="text-xs text-gray-400 mt-1">비밀번호는 8자 이상, 영문/숫자/특수문자 조합을 권장합니다.</p>
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

      {/* 알림톡 수신 동의 */}
      <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3.5 space-y-2">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={alimtalkEnabled}
            onChange={(e) => setAlimtalkEnabled(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-yellow-500 shrink-0"
          />
          <div>
            <p className="text-sm font-semibold text-yellow-900">카카오 알림톡 수신 허용</p>
            <p className="text-xs text-yellow-700 mt-0.5 leading-relaxed">
              제주도 숙소 예약 결과, 건강검진 등 양식 제출 요청 알림을 카카오톡으로 받아보실 수 있습니다.
              원활한 서비스 이용을 위해 <strong>허용을 권장드립니다.</strong> 가입 후 내 정보에서 언제든지 변경 가능합니다.
            </p>
          </div>
        </label>
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

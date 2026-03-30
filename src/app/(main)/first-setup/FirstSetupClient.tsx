"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export default function FirstSetupClient({ initialUsername }: { initialUsername: string }) {
  const [username, setUsername] = useState(initialUsername);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    if (pw.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (pw !== pw2) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/me/first-setup", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, newPassword: pw }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "저장 실패");
      return;
    }
    setOk(data.message ?? "설정 완료");
    setTimeout(() => {
      void signOut({ callbackUrl: "/login" });
    }, 700);
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
      <div>
        <label className="label">새 아이디</label>
        <input className="input w-full" value={username} onChange={(e) => setUsername(e.target.value)} />
        <p className="text-xs text-gray-500 mt-1">영문/숫자/_ 사용 가능, 중복이면 저장되지 않습니다.</p>
      </div>
      <div>
        <label className="label">새 비밀번호</label>
        <input type="password" className="input w-full" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div>
        <label className="label">새 비밀번호 확인</label>
        <input type="password" className="input w-full" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {ok && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{ok}</p>}
      <button type="submit" className="btn-primary w-full" disabled={saving}>
        {saving ? "저장 중..." : "아이디/비밀번호 재설정"}
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

export default function DirectIssueButton({
  employeeId,
  name,
  hasUser,
  buttonClassName,
}: {
  employeeId: string;
  name: string;
  hasUser: boolean;
  buttonClassName?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function run() {
    if (hasUser) return;
    if (!confirm(`${name}님 계정을 직접 발급하시겠습니까?\n아이디=휴대폰번호, 비밀번호=생년월일(8자리)`)) return;
    setLoading(true);
    setErr("");
    setMsg("");
    const res = await fetch(`/api/admin/employees/${employeeId}/provision-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "DIRECT_CREDENTIAL" }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setErr(data.error ?? "직접 발급 실패");
      return;
    }
    setMsg(`발급 완료: ${data.username}`);
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  return (
    <div className="inline-flex flex-col items-end w-full">
      <button
        onClick={run}
        disabled={loading || hasUser}
        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
          hasUser
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200"
        } ${buttonClassName ?? ""}`}
      >
        <KeyRound size={11} />
        {loading ? "발급 중…" : "직접 발급"}
      </button>
      {msg && <p className="text-[11px] text-green-700 mt-1">{msg}</p>}
      {err && <p className="text-[11px] text-red-600 mt-1">{err}</p>}
    </div>
  );
}


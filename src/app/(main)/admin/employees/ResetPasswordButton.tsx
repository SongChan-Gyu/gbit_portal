"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, X } from "lucide-react";

export default function ResetPasswordButton({
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
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit() {
    if (!password.trim() || password.length < 8) {
      setMessage({ type: "err", text: "임시 비밀번호는 8자 이상 입력하세요." });
      return;
    }
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/admin/employees/${employeeId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temporaryPassword: password, sendEmail }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage({ type: "err", text: data.error ?? "초기화 실패" });
      return;
    }
    setMessage({ type: "ok", text: data.message ?? "비밀번호가 초기화되었습니다." });
    setPassword("");
    setTimeout(() => {
      setShowModal(false);
      setMessage(null);
      router.refresh();
    }, 2000);
  }

  if (!hasUser) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => { setShowModal(true); setMessage(null); setPassword(""); }}
        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-all ${buttonClassName ?? ""}`}
      >
        <KeyRound size={11} />
        비밀번호 초기화
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">비밀번호 초기화</h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-3">{name}님의 임시 비밀번호를 설정합니다.</p>
            <div className="space-y-3">
              <div>
                <label className="label">임시 비밀번호 (8자 이상)</label>
                <input
                  type="text"
                  className="input w-full"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="임시 비밀번호"
                  autoComplete="off"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                이메일로 임시 비밀번호 발송
              </label>
            </div>
            {message && (
              <p className={`mt-3 text-sm rounded px-3 py-2 ${message.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                {message.text}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={submit} disabled={loading} className="btn-primary flex-1 py-2">
                {loading ? "처리 중..." : "초기화"}
              </button>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

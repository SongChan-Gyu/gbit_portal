"use client";
import { useState } from "react";
import { Copy, Check, Link2, RefreshCw, X, ExternalLink, Mail } from "lucide-react";
import { formatYMD } from "@/lib/dateUtils";
import { classifyProvisionReason } from "@/lib/accountProvisionMeta";
import ProvisionResultInline from "./ProvisionResultInline";

export default function InviteButton({
  employeeId, name, hasUser, buttonClassName,
}: {
  employeeId: string;
  name: string;
  hasUser: boolean;
  buttonClassName?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<"ok" | "err" | null>(null);
  const [emailMessage, setEmailMessage] = useState("");
  const [resultKind, setResultKind] = useState<"SENT" | "SKIPPED" | "FAILED" | null>(null);

  async function generate() {
    if (url && !confirm(`${name}님의 새 초대 링크를 발급하시겠습니까?\n기존 링크는 만료됩니다.`)) return;
    setLoading(true); setError(""); setResultKind(null);
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      const reason = data.error ?? "링크 발급 실패";
      setError(reason);
      setResultKind(classifyProvisionReason(reason));
      return;
    }
    setUrl(data.url);
    setExpiresAt(data.expiresAt);
    setShowModal(true);
    setResultKind("SENT");
  }

  async function copyUrl() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function sendByEmail() {
    if (!url) return;
    setEmailSending(true);
    setEmailResult(null);
    setEmailMessage("");
    try {
      const res = await fetch("/api/admin/invite/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, url }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmailResult("ok");
        setEmailMessage("이메일을 발송했습니다.");
      } else {
        setEmailResult("err");
        setEmailMessage(data.error ?? "발송 실패");
      }
    } catch {
      setEmailResult("err");
      setEmailMessage("요청 중 오류가 발생했습니다.");
    } finally {
      setEmailSending(false);
    }
  }

  return (
    <>
      <button
        onClick={hasUser ? undefined : generate}
        disabled={loading || hasUser}
        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
          hasUser
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
        } ${buttonClassName ?? ""}`}>
        {loading
          ? <><RefreshCw size={11} className="animate-spin" /><span>생성 중…</span></>
          : <><Link2 size={11} /><span>이메일 초대</span></>}
      </button>

      {/* 링크 모달 */}
      {showModal && url && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Link2 size={15} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">초대 링크 발급 완료</p>
                  <p className="text-xs text-gray-400">{name}님</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* 안내 */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
                <p className="font-semibold mb-1">직원에게 아래 링크를 전달하세요</p>
                <p className="text-xs text-blue-600">
                  링크에 접속하면 아이디·비밀번호를 직접 설정할 수 있습니다.
                  {expiresAt && (
                    <span className="block mt-1 font-medium">
                      유효기간: {formatYMD(expiresAt)} {new Date(expiresAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}까지 (7일)
                    </span>
                  )}
                </p>
              </div>

              {/* URL 박스 */}
              <div>
                <label className="label">회원가입 링크</label>
                <div className="flex gap-2 mt-1">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 font-mono break-all select-all">
                    {url}
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={copyUrl}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      copied
                        ? "bg-green-500 text-white"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}>
                    {copied ? <><Check size={14} /> 복사됨!</> : <><Copy size={14} /> 링크 복사</>}
                  </button>
                  <button
                    onClick={sendByEmail}
                    disabled={emailSending}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50 transition-all">
                    <Mail size={14} />
                    {emailSending ? "발송 중…" : "이메일 전송"}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                    <ExternalLink size={13} /> 미리보기
                  </a>
                </div>
                {emailResult && (
                  <p className={`text-sm mt-2 px-3 py-2 rounded-lg ${emailResult === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                    {emailMessage}
                  </p>
                )}
              </div>

              {/* 주의사항 */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">주의사항</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>링크는 1회만 사용 가능합니다.</li>
                  <li>7일 후 자동 만료됩니다.</li>
                  <li>동일 사원에게 재발급 시 기존 링크는 무효화됩니다.</li>
                </ul>
              </div>
            </div>

            <div className="px-6 pb-5">
              <button onClick={() => setShowModal(false)}
                className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors">
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <ProvisionResultInline kind={resultKind ?? "FAILED"} message={error} className="text-xs" />
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { MessageSquare, RefreshCw, Copy, Check, ExternalLink, X, Link2 } from "lucide-react";
import { formatYMD } from "@/lib/dateUtils";

type ModalSource = "alimtalk" | "link";

export default function AlimtalkInviteButton({
  employeeId,
  name,
  phone,
  hasUser,
  buttonClassName,
}: {
  employeeId: string;
  name: string;
  phone: string;
  hasUser: boolean;
  buttonClassName?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [loadingKind, setLoadingKind] = useState<ModalSource | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const [modalSource, setModalSource] = useState<ModalSource>("alimtalk");
  const [alimtalkResult, setAlimtalkResult] = useState<{ status: string; reason?: string } | null>(null);

  const hasPhone = !!phone?.replace(/[^0-9]/g, "")?.trim();

  async function generateLinkOnly() {
    if (url && !confirm(`${name}님의 새 초대 링크를 발급하시겠습니까?\n기존 링크는 만료됩니다.`)) return;
    setLoading(true);
    setLoadingKind("link");
    setError("");
    setAlimtalkResult(null);
    setModalSource("link");

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    setLoadingKind(null);

    if (!res.ok) {
      setError(data.error ?? "링크 발급 실패");
      return;
    }

    setUrl(data.url);
    setExpiresAt(data.expiresAt ?? null);
    setShowModal(true);
  }

  async function generateAlimtalk() {
    if (url && !confirm(`${name}님의 새 초대 링크를 발급하시겠습니까?\n기존 링크는 만료됩니다.`)) return;
    setLoading(true);
    setLoadingKind("alimtalk");
    setError("");
    setAlimtalkResult(null);
    setModalSource("alimtalk");

    const res = await fetch("/api/admin/invite/alimtalk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    setLoadingKind(null);

    if (!res.ok) {
      setError(data.error ?? "링크 발급 실패");
      return;
    }

    setUrl(data.url);
    setExpiresAt(data.expiresAt ?? null);
    setAlimtalkResult({ status: data.alimtalkStatus ?? "UNKNOWN", reason: data.alimtalkReason });
    setShowModal(true);
  }

  async function copyUrl() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const linkDisabled = loading || hasUser;
  const alimtalkDisabled = loading || hasUser || !hasPhone;
  const alimtalkTitle = hasUser ? "이미 계정 있음" : !hasPhone ? "연락처 없음" : undefined;

  const isAlimtalkModal = modalSource === "alimtalk";

  return (
    <>
      <div className={`flex flex-col sm:flex-row flex-wrap gap-1.5 ${buttonClassName ?? ""}`}>
        <button
          type="button"
          onClick={linkDisabled ? undefined : generateLinkOnly}
          disabled={linkDisabled}
          title={hasUser ? "이미 계정 있음" : undefined}
          className={`inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex-1 sm:flex-initial min-w-0 ${
            linkDisabled
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-300"
          }`}
        >
          {loading && loadingKind === "link" ? (
            <>
              <RefreshCw size={11} className="animate-spin shrink-0" />
              <span>생성 중…</span>
            </>
          ) : (
            <>
              <Link2 size={11} className="shrink-0" />
              <span>초대 링크만</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={alimtalkDisabled ? undefined : generateAlimtalk}
          disabled={alimtalkDisabled}
          title={alimtalkTitle}
          className={`inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex-1 sm:flex-initial min-w-0 ${
            alimtalkDisabled
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-300"
          }`}
        >
          {loading && loadingKind === "alimtalk" ? (
            <>
              <RefreshCw size={11} className="animate-spin shrink-0" />
              <span>발송 중…</span>
            </>
          ) : (
            <>
              <MessageSquare size={11} className="shrink-0" />
              <span>알림톡 초대</span>
            </>
          )}
        </button>
      </div>

      {showModal && url && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isAlimtalkModal ? "bg-yellow-100" : "bg-slate-100"
                  }`}
                >
                  {isAlimtalkModal ? (
                    <MessageSquare size={15} className="text-yellow-600" />
                  ) : (
                    <Link2 size={15} className="text-slate-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    {isAlimtalkModal ? "알림톡 초대 발송 완료" : "초대 링크 발급"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {name}님{isAlimtalkModal && phone ? ` · ${phone}` : ""}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {isAlimtalkModal && alimtalkResult && (
                <div
                  className={`rounded-xl p-3 text-sm border ${
                    alimtalkResult.status === "SENT"
                      ? "bg-green-50 border-green-200 text-green-800"
                      : alimtalkResult.status === "MOCKED"
                        ? "bg-blue-50 border-blue-200 text-blue-800"
                        : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}
                >
                  <p className="font-semibold">
                    {alimtalkResult.status === "SENT" && "알림톡 발송 완료"}
                    {alimtalkResult.status === "MOCKED" && "알림톡 Mock (미발송 — 로컬/테스트)"}
                    {alimtalkResult.status === "SKIPPED" && "알림톡 스킵 (테스트 안전장치)"}
                    {alimtalkResult.status === "FAILED" && "알림톡 발송 실패 — 링크는 복사해서 전달하세요"}
                  </p>
                  {alimtalkResult.reason && <p className="text-xs mt-1 opacity-80">{alimtalkResult.reason}</p>}
                </div>
              )}

              <div
                className={`rounded-xl p-4 text-sm border ${
                  isAlimtalkModal
                    ? "bg-yellow-50 border-yellow-100 text-yellow-800"
                    : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              >
                <p className="font-semibold mb-1">
                  {isAlimtalkModal ? "알림톡이 미발송된 경우 아래 링크를 직접 전달하세요" : "아래 링크를 복사해 전달하세요"}
                </p>
                <p className={`text-xs ${isAlimtalkModal ? "text-yellow-700" : "text-slate-600"}`}>
                  링크에 접속하면 아이디·비밀번호를 설정할 수 있습니다.
                  {expiresAt && (
                    <span className="block mt-1 font-medium">
                      유효기간: {formatYMD(expiresAt)}{" "}
                      {new Date(expiresAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}까지 (7일)
                    </span>
                  )}
                </p>
              </div>

              <div>
                <label className="label">회원가입 링크</label>
                <div className="flex gap-2 mt-1">
                  <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-700 font-mono break-all select-all">
                    {url}
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={copyUrl}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      copied ? "bg-green-500 text-white" : isAlimtalkModal
                        ? "bg-yellow-500 text-white hover:bg-yellow-600"
                        : "bg-slate-600 text-white hover:bg-slate-700"
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check size={14} /> 복사됨!
                      </>
                    ) : (
                      <>
                        <Copy size={14} /> 링크 복사
                      </>
                    )}
                  </button>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <ExternalLink size={13} /> 미리보기
                  </a>
                </div>
              </div>

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
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full py-2.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </>
  );
}

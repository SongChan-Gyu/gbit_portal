"use client";

import Link from "next/link";
import { Megaphone, X } from "lucide-react";

export type LoginAnnouncementPayload = {
  id: string;
  title: string;
  body: string;
  detailMode: string;
  noticeId: string | null;
  noticeTitle?: string | null;
};

type Props = {
  data: LoginAnnouncementPayload;
  preview?: boolean;
  onClose?: () => void;
  onDismissWeek?: () => void;
  onDismissClose?: () => void;
  busy?: boolean;
};

export default function LoginAnnouncementModal({
  data,
  preview = false,
  onClose,
  onDismissWeek,
  onDismissClose,
  busy = false,
}: Props) {
  const showDetail = data.detailMode === "NOTICE" && data.noticeId;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-announce-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-200/80 bg-white shadow-xl shadow-slate-900/10 overflow-hidden">
        {preview && (
          <div className="absolute top-3 right-3 z-10">
            <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold px-2.5 py-0.5 border border-amber-200">
              미리보기
            </span>
          </div>
        )}

        <div className="bg-gradient-to-br from-slate-700 to-slate-800 px-6 py-5 text-white relative">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <Megaphone className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 pr-8">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-300/90 mb-1">공지</p>
              <h2 id="login-announce-title" className="text-lg font-bold leading-snug">
                {data.title}
              </h2>
            </div>
          </div>
          {preview && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition"
              aria-label="닫기"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          <p className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-wrap">{data.body}</p>
          {showDetail && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
              <p className="text-xs text-blue-800/80 mb-1">자세한 내용</p>
              <p className="text-sm font-medium text-blue-900">{data.noticeTitle ?? "연결된 공지"}</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 sm:px-6 pb-5 sm:pb-6 pt-0">
          {!preview && onDismissWeek ? (
            <button
              type="button"
              disabled={busy}
              onClick={onDismissWeek}
              className="shrink-0 text-xs sm:text-sm font-medium text-gray-600 hover:text-gray-900 px-2.5 sm:px-3 py-2 rounded-lg border border-gray-200 bg-gray-50/80 hover:bg-gray-100 hover:border-gray-300 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              7일 동안 보지 않기
            </button>
          ) : (
            <span className="shrink-0" aria-hidden />
          )}
          <div className="flex-1 min-w-0" />
          <div className="flex items-center gap-2 shrink-0">
            {showDetail && (
              <Link
                href={preview ? "#" : `/notices/${data.noticeId}`}
                onClick={(e) => preview && e.preventDefault()}
                className="btn-secondary text-sm py-2.5 px-3 sm:px-4 rounded-lg whitespace-nowrap"
              >
                자세히 보기
              </Link>
            )}
            {preview ? (
              <button type="button" onClick={onClose} className="btn-primary text-sm py-2.5 px-4 sm:px-5 rounded-lg whitespace-nowrap">
                확인
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={onDismissClose}
                className="btn-primary text-sm py-2.5 px-4 sm:px-5 rounded-lg disabled:opacity-50 whitespace-nowrap"
              >
                확인
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

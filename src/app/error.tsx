"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[App Error]", error);
  }, [error]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6 text-amber-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-800 mb-2">일시적인 오류가 발생했습니다</h1>
        <p className="text-sm text-gray-500 mb-4">
          요청을 처리하는 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center justify-center px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

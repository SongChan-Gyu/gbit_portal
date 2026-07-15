import type { Metadata } from "next";
import JejuExternalStayClient from "./JejuExternalStayClient";

export const metadata: Metadata = {
  title: "제주 숙소 입실 일정",
  description: "제주 숙소 입실·퇴실 일정 조회",
};

export default async function JejuExternalStayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 8) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <p className="text-sm text-gray-600">링크가 올바르지 않습니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-6 sm:py-8 px-4">
      <div className="max-w-4xl mx-auto min-w-0">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-gray-900">제주 숙소 입실 일정</h1>
          <p className="text-sm text-gray-500 mt-1">외부 조회 전용 (로그인 불필요)</p>
        </div>
        <JejuExternalStayClient token={token} />
      </div>
    </div>
  );
}

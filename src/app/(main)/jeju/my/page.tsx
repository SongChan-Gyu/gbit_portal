import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import JejuMyClient from "./JejuMyClient";

export const metadata = { title: "예약 신청 내역 | 제주도 숙소" };

export default async function JejuMyPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">예약 신청 내역</h1>
        <p className="page-subtitle">제주도 숙소 예약 신청·승인·취소 내역입니다.</p>
      </div>
      <JejuMyClient />
    </div>
  );
}

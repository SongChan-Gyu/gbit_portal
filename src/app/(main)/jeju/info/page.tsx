import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MapPin, Car, Clock } from "lucide-react";
import JejuMap from "./JejuMap";
import JejuNoticeSection from "./JejuNoticeSection";
import prisma from "@/lib/db";
import { getJejuNoticeItems } from "@/lib/jejuNoticeItems";

export const metadata = { title: "숙소 정보 | 제주도 숙소 | GBIT Portal" };

export default async function JejuInfoPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as { role?: string };
  const canEditNotice = user.role === "ADMIN";
  const noticeItems = await getJejuNoticeItems(prisma);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Link href="/jeju" className="btn-ghost text-gray-500 hover:text-gray-700">← 예약하기</Link>
      </div>
      <div>
        <h1 className="page-title">숙소 정보</h1>
        <p className="page-subtitle">오시는길, 입퇴실 시간, 이용주의사항을 확인하세요.</p>
      </div>

      {/* 오시는길 */}
      <section id="directions" className="card space-y-6 scroll-mt-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
          <MapPin size={18} className="text-blue-600" />
          오시는길
        </h2>
        <div>
          <p className="text-[13px] text-gray-700">
            제주특별자치도 제주시 한경면 고산로2길 10
          </p>
          <p className="text-xs text-gray-500 mt-1">
            네비게이션에서 &quot;고도 17&quot; 또는 위 주소로 검색하시면 됩니다.
          </p>
          <a
            href="https://map.kakao.com/link/search/제주특별자치도%20제주시%20한경면%20고산로2길%2010"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            카카오 지도에서 보기
          </a>
        </div>
        <JejuMap />
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1">
            <Car size={16} className="text-blue-600" />
            주차
          </h3>
          <p className="text-[13px] text-gray-700">숙소 마당에 2대까지 주차 가능합니다.</p>
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-1">
            <Clock size={16} className="text-blue-600" />
            입실·퇴실 시간
          </h3>
          <ul className="text-[13px] text-gray-700 space-y-1">
            <li>입실: 15:00 (오후 3시)</li>
            <li>퇴실: 11:00 (오전 11시)</li>
          </ul>
        </div>
      </section>

      <JejuNoticeSection initialItems={noticeItems} canEdit={canEditNotice} />
    </div>
  );
}

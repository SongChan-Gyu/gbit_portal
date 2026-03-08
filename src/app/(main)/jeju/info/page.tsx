import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { MapPin, Car, Clock, AlertTriangle } from "lucide-react";

export const metadata = { title: "숙소 정보 | 제주도 숙소 | HRM" };

const NOTICE_ITEMS = [
  "기준 인원 4명, 최대 숙박 인원 6명(어린이·영유아 포함)입니다.",
  "애견동반(소형견)은 사전 연락 후 가능합니다.",
  "예약 인원 외 방문자는 입실 불가합니다.",
  "실내 공간 금연입니다.",
  "자쿠지 이용 시 별도 금액이 발생할 수 있으며, 현장 결제 가능합니다. 입욕제는 제공품 또는 지참 일반 입욕제만 사용 가능하며, 꽃잎·약초·반짝이 입욕제 등은 배수 문제로 사용을 금합니다.",
  "외부 주차장 CCTV가 설치되어 있습니다.",
  "화재 예방을 위해 향초, 불꽃놀이 등 사용을 금합니다.",
  "실내에서 고기·생선 구이, 튀김 등 냄새가 심한 요리는 금합니다.",
  "실내·외 시설 및 비치된 물건(비품, 침구, 수건 등) 훼손·분실·파손·오염 시 복구 비용을 부담하셔야 합니다.",
  "게스트 부주의로 인한 안전사고, 귀중품 분실·파손에 대해서는 호스트 책임이 없습니다.",
  "문제 발생 시 당황하지 마시고 담당자에게 연락 부탁드립니다.",
  "밤 10시 이후 고성, 바베큐 등 주변에 피해가 되지 않도록 부탁드립니다.",
  "지역 특성상 벌레·곤충 등이 실내로 유입될 수 있으며, 이로 인한 환불은 불가합니다.",
  "상업적 사진·영상 촬영(광고, 제품 사진 등)은 사전 협의 후 진행해 주세요.",
];

export default async function JejuInfoPage() {
  const session = await auth();
  if (!session) redirect("/login");

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
        </div>
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

      {/* 이용주의사항 */}
      <section id="notice" className="card scroll-mt-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 mb-4">
          <AlertTriangle size={18} className="text-amber-500" />
          이용주의사항
        </h2>
        <ul className="space-y-3 text-[13px] text-gray-700 list-none">
          {NOTICE_ITEMS.map((text, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-amber-500 shrink-0">•</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

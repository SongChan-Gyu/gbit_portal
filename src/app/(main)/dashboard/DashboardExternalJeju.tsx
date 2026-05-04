import Link from "next/link";
import { Home, List, MapPin, Calendar } from "lucide-react";
import { formatMDWithDayFromYMD } from "@/lib/dateUtils";

export type ExternalJejuRow = {
  id: string;
  startDate: string;
  endDate: string;
  nights: number;
  status: string;
  guestName: string;
  guestCount: number;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "복지부 승인 대기",
  STEP1_APPROVED: "입금확인 대기",
  APPROVED: "예약 확정",
  REJECTED: "반려",
  CANCELLED: "취소",
  CANCEL_REQUESTED: "취소 요청 중",
  CANCEL_STEP1_APPROVED: "입금취소 대기",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "badge-warning",
  STEP1_APPROVED: "badge-info",
  APPROVED: "badge-success",
  REJECTED: "badge-danger",
  CANCELLED: "badge-default",
  CANCEL_REQUESTED: "badge-warning",
  CANCEL_STEP1_APPROVED: "badge-warning",
};

function dateLine(start: string, end: string) {
  return start === end
    ? formatMDWithDayFromYMD(start)
    : `${formatMDWithDayFromYMD(start)} ~ ${formatMDWithDayFromYMD(end)}`;
}

export default function DashboardExternalJeju({
  employeeName,
  teamName,
  position,
  rows,
  inProgress,
  approved,
  total,
  notices,
}: {
  employeeName: string;
  teamName: string | null;
  position: string;
  rows: ExternalJejuRow[];
  inProgress: number;
  approved: number;
  total: number;
  notices: { id: string; title: string }[];
}) {
  return (
    <div className="space-y-4">
      <div className="panel">
        <div className="panel-header">
          <div>
            <span className="panel-title">{employeeName}</span>
            <span className="text-gray-500 text-sm md:text-xs ml-2">
              {teamName ?? "팀 없음"} · {position}
            </span>
          </div>
          <span className="badge bg-teal-50 text-teal-800 border border-teal-200">외부개발자 · 제주 숙소</span>
        </div>
        <div className="panel-body">
          <p className="text-sm text-gray-600 mb-4">
            휴가·연차 기능은 사용 대상이 아닙니다. 아래에서 <strong className="text-gray-800">제주도 숙소 예약</strong>만 이용하실 수 있습니다.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="stat-card">
              <div className={`stat-num ${inProgress > 0 ? "text-amber-600" : "text-gray-400"}`}>{inProgress}</div>
              <div className="stat-label">진행 중 신청</div>
            </div>
            <div className="stat-card">
              <div className={`stat-num ${approved > 0 ? "text-green-600" : "text-gray-400"}`}>{approved}</div>
              <div className="stat-label">예약 확정</div>
            </div>
            <div className="stat-card">
              <div className="stat-num text-gray-800">{total}</div>
              <div className="stat-label">누적 신청 건수</div>
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-2">
            <Link href="/jeju" className="btn-primary text-center py-2.5 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2">
              <Home size={16} /> 예약하기
            </Link>
            <Link
              href="/jeju/my"
              className="btn-secondary text-center py-2.5 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              <List size={16} /> 예약 신청 내역
            </Link>
            <Link
              href="/jeju/info"
              className="btn-secondary text-center py-2.5 px-4 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-2"
            >
              <MapPin size={16} /> 숙소 정보
            </Link>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">최근 제주 숙소 신청</span>
          <Link href="/jeju/my" className="text-sm md:text-xs text-slate-600 hover:underline touch-manipulation">
            전체보기
          </Link>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-gray-500 mb-4">아직 신청 내역이 없습니다.</p>
            <Link href="/jeju" className="btn-primary btn-sm inline-flex items-center gap-2">
              <Calendar size={14} /> 숙소 예약하기
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((r) => (
              <Link
                key={r.id}
                href="/jeju/my"
                className="block px-4 py-3 md:py-2.5 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] md:text-[13px] font-semibold text-gray-800">{dateLine(r.startDate, r.endDate)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {r.nights}박 · 투숙 {r.guestName} {r.guestCount}명
                    </p>
                  </div>
                  <span className={`badge shrink-0 ${STATUS_BADGE[r.status] ?? "badge-default"}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {notices.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <span className="font-medium text-gray-600">공지</span>
            {notices.map((n, i) => (
              <span key={n.id} className="flex items-center gap-x-2">
                {i > 0 && <span className="text-gray-300">·</span>}
                <Link href={`/notices/${n.id}`} className="text-blue-600 hover:underline truncate max-w-[160px] sm:max-w-xs">
                  {n.title}
                </Link>
              </span>
            ))}
            <span className="text-gray-300">·</span>
            <Link href="/notices" className="text-gray-400 hover:text-gray-600 shrink-0">
              더보기
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

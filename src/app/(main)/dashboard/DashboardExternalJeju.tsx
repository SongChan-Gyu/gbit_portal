import Link from "next/link";
import { Home, List, MapPin, Calendar, ChevronRight, BedDouble, CheckCircle2, Clock3, FileText } from "lucide-react";
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

type FormItem = { id: string; title: string; slug: string | null; description: string | null; submitted?: boolean; isAnonymous?: boolean };

export default function DashboardExternalJeju({
  employeeName,
  teamName,
  position,
  rows,
  inProgress,
  approved,
  total,
  notices,
  forms = [],
}: {
  employeeName: string;
  teamName: string | null;
  position: string;
  rows: ExternalJejuRow[];
  inProgress: number;
  approved: number;
  total: number;
  notices: { id: string; title: string }[];
  forms?: FormItem[];
}) {
  return (
    <div className="space-y-4">

      {/* 헤더 카드 */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-title">{employeeName}</p>
            <p className="text-xs text-gray-500 mt-0.5">{teamName ?? "팀 없음"} · {position}</p>
          </div>
          <span className="shrink-0 badge bg-teal-50 text-teal-800 border border-teal-200">외부개발자</span>
        </div>
        <div className="panel-body space-y-4">
          {/* 스탯 + 버튼 6셀 동일 높이 그리드 */}
          <div className="grid grid-cols-3 gap-2">
            {/* 스탯 */}
            <div className="h-20 flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
              <span className={`text-2xl font-bold tabular-nums ${inProgress > 0 ? "text-amber-500" : "text-gray-400"}`}>{inProgress}</span>
              <span className="text-xs text-gray-500 mt-0.5">진행 중</span>
            </div>
            <div className="h-20 flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
              <span className={`text-2xl font-bold tabular-nums ${approved > 0 ? "text-green-600" : "text-gray-400"}`}>{approved}</span>
              <span className="text-xs text-gray-500 mt-0.5">예약 확정</span>
            </div>
            <div className="h-20 flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
              <span className="text-2xl font-bold tabular-nums text-gray-800">{total}</span>
              <span className="text-xs text-gray-500 mt-0.5">누적 신청</span>
            </div>
            {/* 버튼 */}
            <Link href="/jeju" className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-slate-800 text-white font-semibold text-xs hover:bg-slate-900 transition-colors">
              <Home size={18} />
              예약하기
            </Link>
            <Link href="/jeju/my" className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-gray-700 font-medium text-xs hover:bg-gray-200 transition-colors">
              <List size={18} />
              신청 내역
            </Link>
            <Link href="/jeju/info" className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-gray-700 font-medium text-xs hover:bg-gray-200 transition-colors">
              <MapPin size={18} />
              숙소 정보
            </Link>
          </div>
        </div>
      </div>

      {/* 양식 제출 */}
      {forms.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-gray-500" />
              <span className="panel-title">양식 제출</span>
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {forms.map((f) => (
              <Link
                key={f.id}
                href={f.slug ? `/f/${f.slug}` : `/forms/${f.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[15px] md:text-sm font-medium ${f.submitted ? "text-gray-400" : "text-gray-800"}`}>
                      {f.title}
                    </span>
                    {f.isAnonymous && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                        익명
                      </span>
                    )}
                    {f.submitted ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        <CheckCircle2 size={11} /> 제출완료
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        <Clock3 size={11} /> 미제출
                      </span>
                    )}
                  </div>
                  {f.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{f.description}</p>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 shrink-0 ml-2" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 최근 제주 신청 */}
      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <BedDouble size={15} className="text-gray-500" />
            <span className="panel-title">최근 제주 숙소 신청</span>
          </div>
          <Link href="/jeju/my" className="text-sm md:text-xs text-slate-500 hover:underline">
            전체보기
          </Link>
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <BedDouble size={32} className="mx-auto text-gray-200 mb-3" />
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
                className="block px-4 py-3 hover:bg-slate-50 transition-colors"
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

      {/* 공지 */}
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
            <Link href="/notices" className="text-gray-400 hover:text-gray-600 shrink-0">더보기</Link>
          </div>
        </div>
      )}
    </div>
  );
}

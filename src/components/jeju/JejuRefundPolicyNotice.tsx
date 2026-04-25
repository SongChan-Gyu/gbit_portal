"use client";

type Props = {
  variant: "short" | "full";
  className?: string;
  /** 입금확인 대기(복지부 승인) 시점부터 며칠 내 미입금 시 자동 취소 (기본 5) — 스케줄러와 동일 */
  depositDeadlineDays?: number;
  /** GET /api/jeju/config 기준 예약금 계좌 한 줄 */
  depositAccountSummary?: string | null;
};

/**
 * 제주 숙소 예약금 환불 규정 (내부 안내문 기준).
 * - short: 예약 신청 화면 요약
 * - full: 예약 내역·결재함 등 건별 상세 — 신청자·PM·복지부 공통 표시
 */
export function JejuRefundPolicyNotice({
  variant,
  className = "",
  depositDeadlineDays = 5,
  depositAccountSummary = null,
}: Props) {
  if (variant === "short") {
    return (
      <aside
        className={`rounded-xl border border-slate-200 bg-slate-50/95 px-3 py-3 text-[11px] sm:text-xs text-slate-800 leading-relaxed ${className}`}
      >
        <p className="font-semibold text-slate-900 mb-1.5">취소·환불 안내 (요약)</p>
        <p>
          입실일 기준 <strong className="text-slate-900">30일 전까지</strong> 취소 → <strong>100%</strong> 환불,
          {" "}
          <strong>15일 전까지</strong> → <strong>50%</strong>,
          {" "}
          <strong>예약 당일</strong> 취소 → <strong>100%</strong> 환불입니다. (1개월은 <strong>30일</strong>로 계산)
        </p>
      </aside>
    );
  }

  return (
    <aside
      className={`rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[11px] sm:text-xs text-slate-800 leading-relaxed space-y-2 ${className}`}
    >
      <p className="font-semibold text-slate-900">예약금 환불 규정</p>
      <ul className="list-disc pl-4 space-y-1.5">
        <li>
          <strong className="text-slate-900">100% 환불:</strong> 투숙(입실)일로부터 <strong>30일 이전</strong>까지
          취소. (1개월은 <strong>30일</strong>로 계산합니다. 예: 입실이 3/31이면 3/1까지 취소 시 전액 환불)
        </li>
        <li>
          <strong className="text-slate-900">50% 환불:</strong> 입실일로부터 <strong>15일 이전</strong>까지 취소.
          (예: 입실이 3/16이면 3/1까지 취소 시 50% 환불)
        </li>
        <li>
          <strong className="text-slate-900">당일 예약 후 당일 취소:</strong> 예약을 접수한 <strong>같은 날</strong>{" "}
          취소하면 <strong>100%</strong> 환불입니다. (입실일이 한 달 이내라도 동일하게 적용)
        </li>
      </ul>
      <p className="text-[11px] text-slate-600 border-t border-slate-200/80 pt-2 space-y-1">
        <span className="block">
          예약금은 신청 <strong className="text-slate-800">당일</strong> 이체를 권장합니다.{" "}
          <strong className="text-slate-800">입금확인 대기</strong>가 된 시점부터{" "}
          <strong className="text-slate-800">{depositDeadlineDays}일</strong> 안에 입금이 확인되지 않으면 예약이
          자동 취소됩니다.
        </span>
        {depositAccountSummary ? (
          <span className="block text-slate-700">
            입금 계좌: <strong className="text-slate-900 font-medium">{depositAccountSummary}</strong>
          </span>
        ) : (
          <span className="block">입금 계좌는 포털 제주 숙소 예약 화면에 안내된 예약금 계좌와 동일합니다.</span>
        )}
      </p>
    </aside>
  );
}

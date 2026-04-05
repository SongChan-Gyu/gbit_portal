"use client";

import { useState } from "react";
import CancelButton from "./CancelButton";
import CancelRequestButton from "./CancelRequestButton";

export default function MyLeaveRequestFooter({
  requestId,
  status,
  showDetail,
  detailSummaryLabel,
  children,
}: {
  requestId: string;
  status: string;
  showDetail: boolean;
  /** 예: "신청·결재 상세" | "상세보기" */
  detailSummaryLabel: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-gray-100 bg-gray-50/90 md:bg-gray-50/30">
      <div className="grid grid-cols-2 divide-x divide-gray-100">
        <div className="flex min-h-[48px] items-stretch justify-center">
          {status === "PENDING" && (
            <CancelButton
              requestId={requestId}
              className="flex-1 w-full rounded-none min-h-[48px] justify-center border-0 bg-transparent hover:bg-red-50 text-sm font-medium"
            />
          )}
          {status === "APPROVED" && (
            <CancelRequestButton
              requestId={requestId}
              className="flex-1 w-full rounded-none min-h-[48px] justify-center border-0 border-transparent bg-transparent hover:bg-orange-50 text-sm font-medium"
            />
          )}
          {status === "CANCEL_REQUESTED" && (
            <span className="flex flex-1 items-center justify-center text-xs text-orange-800 bg-orange-50/90 px-2 text-center">
              취소심사 중
            </span>
          )}
          {!["PENDING", "APPROVED", "CANCEL_REQUESTED"].includes(status) && (
            <span className="flex flex-1 items-center justify-center text-xs text-gray-400">—</span>
          )}
        </div>
        <div className="flex min-h-[48px] items-stretch">
          {showDetail ? (
            <button
              type="button"
              className="flex-1 w-full min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-2 text-sm font-medium text-slate-700 hover:bg-slate-50/90 bg-white/80"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span>{detailSummaryLabel}</span>
              <span className="text-[10px] font-normal text-gray-400">{open ? "접기" : "펼치기"}</span>
            </button>
          ) : (
            <span className="flex flex-1 items-center justify-center text-xs text-gray-300">—</span>
          )}
        </div>
      </div>
      {showDetail && open && (
        <div className="border-t border-gray-200 bg-white px-3 py-3 text-left max-h-[min(70vh,28rem)] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

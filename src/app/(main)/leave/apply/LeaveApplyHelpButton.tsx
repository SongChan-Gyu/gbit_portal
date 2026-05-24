"use client";

import { CircleHelp } from "lucide-react";

export const LEAVE_APPLY_TOUR_REPLAY_EVENT = "leave-apply-tour:replay";

export function replayLeaveApplyTour() {
  window.dispatchEvent(new CustomEvent(LEAVE_APPLY_TOUR_REPLAY_EVENT));
}

export default function LeaveApplyHelpButton() {
  return (
    <button
      type="button"
      onClick={replayLeaveApplyTour}
      className="shrink-0 inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-indigo-600 hover:text-indigo-800 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/60 hover:bg-indigo-50 transition-colors"
      aria-label="휴가 신청 화면 안내 다시 보기"
    >
      <CircleHelp className="h-4 w-4" aria-hidden />
      도움말
    </button>
  );
}

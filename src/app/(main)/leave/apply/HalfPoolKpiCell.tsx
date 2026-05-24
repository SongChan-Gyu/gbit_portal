"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  halfPoolKpiForMonth,
  nextMonthKey,
  prevMonthKey,
} from "@/lib/halfdayPolicy";

type Props = {
  currentMonthKey: string;
  halfDayUsedByMonth: Record<string, number>;
  healingHalfReplaceUsedByMonth: Record<string, number>;
};

export default function HalfPoolKpiCell({
  currentMonthKey,
  halfDayUsedByMonth,
  healingHalfReplaceUsedByMonth,
}: Props) {
  const [viewMonthKey, setViewMonthKey] = useState(currentMonthKey);
  const kpi = useMemo(
    () => halfPoolKpiForMonth(viewMonthKey, halfDayUsedByMonth, healingHalfReplaceUsedByMonth),
    [viewMonthKey, halfDayUsedByMonth, healingHalfReplaceUsedByMonth],
  );
  const canGoPrev = viewMonthKey > currentMonthKey;

  return (
    <div
      data-tour="leave-half-kpi"
      className="col-span-2 sm:col-span-1 text-center min-w-0 px-1 py-2 sm:py-0.5 flex flex-col justify-center gap-1 border-t sm:border-t-0 border-gray-200/90 max-sm:border-l-0 mt-2 sm:mt-0 pt-2.5 sm:pt-0"
    >
      <div className="flex items-center justify-center gap-0.5 min-h-[1.25rem]">
        <button
          type="button"
          onClick={() => setViewMonthKey((k) => {
            const prev = prevMonthKey(k);
            return prev < currentMonthKey ? currentMonthKey : prev;
          })}
          disabled={!canGoPrev}
          className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-25 disabled:pointer-events-none"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <p className="text-[11px] sm:text-xs text-gray-500 leading-tight px-0.5">{kpi.title}</p>
        <button
          type="button"
          onClick={() => setViewMonthKey((k) => nextMonthKey(k))}
          className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          aria-label="다음 달"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <p
        className={`leading-none ${
          kpi.used
            ? "text-[clamp(1rem,3.5vw,1.125rem)] font-bold text-gray-400"
            : "text-[clamp(1.1rem,4.5vw,1.375rem)] font-black text-sky-600"
        }`}
      >
        {kpi.statusLabel}
      </p>
    </div>
  );
}

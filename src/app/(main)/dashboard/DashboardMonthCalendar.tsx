"use client";

import { useState, useRef, useEffect, useMemo } from "react";

type ByDay = Record<string, { name: string; status: string }[]>;

const DAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

export default function DashboardMonthCalendar({
  year,
  month,
  dates,
  byDay,
  holidayYmds,
  todayStr,
}: {
  year: number;
  month: number;
  dates: string[];
  byDay: ByDay;
  holidayYmds: string[];
  todayStr: string;
}) {
  const [tooltipDate, setTooltipDate] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const holidaySet = useMemo(() => new Set(holidayYmds), [holidayYmds]);

  const firstDow = new Date(year, month - 1, 1).getDay();
  const pad = Array(firstDow).fill(null);
  const cells = [...pad, ...dates.map((d) => d)];

  useEffect(() => {
    if (!tooltipDate) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setTooltipDate(null);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [tooltipDate]);

  function handleCellClick(e: React.MouseEvent, dateStr: string) {
    e.stopPropagation();
    const list = byDay[dateStr] ?? [];
    if (list.length === 0) {
      setTooltipDate(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipPos({
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2,
    });
    setTooltipDate(dateStr);
  }

  const list = tooltipDate ? (byDay[tooltipDate] ?? []) : [];

  return (
    <div ref={containerRef} className="border border-gray-200 rounded-lg p-2 sm:p-3 bg-gray-50/50 max-w-2xl mx-auto">
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center">
        {DAYS_KO.map((d, wi) => (
          <div
            key={d}
            className={`text-[10px] sm:text-xs font-semibold py-0.5 ${
              wi === 0 ? "text-red-500" : "text-gray-500"
            }`}
          >
            {d}
          </div>
        ))}
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={`e-${i}`} />;
          const dayList = byDay[dateStr] ?? [];
          const hasLeave = dayList.length > 0;
          const isToday = dateStr === todayStr;
          const [cy, cm, cd] = dateStr.split("-").map((x: string) => parseInt(x, 10));
          const dow = new Date(cy, cm - 1, cd).getDay();
          const isSun = dow === 0;
          const isHol = holidaySet.has(dateStr);
          const isRedDay = isHol || isSun;
          return (
            <button
              key={dateStr}
              type="button"
              onClick={(e) => handleCellClick(e, dateStr)}
              className={`min-h-[40px] sm:min-h-[44px] flex flex-col items-center justify-center rounded text-[11px] sm:text-xs p-0.5 touch-manipulation ${
                isToday ? "ring-1 ring-blue-400 bg-blue-50 font-bold" : ""
              } ${hasLeave ? "bg-red-50/80" : ""} ${hasLeave ? "cursor-pointer hover:bg-red-100/80" : ""}`}
              title={hasLeave ? `${dateStr}: ${dayList.map((x) => `${x.name} ${x.status}`).join(", ")}` : undefined}
            >
              <span
                className={
                  isRedDay
                    ? "font-semibold"
                    : isToday
                      ? "text-blue-700"
                      : "text-gray-700"
                }
                style={isRedDay ? { color: "#c62828" } : undefined}
              >
                {dateStr.slice(8, 10)}
              </span>
              {hasLeave && (
                <span className="mt-0.5 text-[10px] font-medium text-red-600">
                  {dayList.length}명
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tooltipDate && list.length > 0 && (
        <div
          className="fixed z-50 min-w-[140px] max-w-[90vw] py-2 px-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: "translateX(-50%)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-semibold text-gray-200 mb-1.5 border-b border-gray-600 pb-1">
            {tooltipDate}
          </div>
          <ul className="space-y-1">
            {list.map((x, j) => (
              <li key={j} className="text-white">
                {x.name} <span className="text-gray-300">{x.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

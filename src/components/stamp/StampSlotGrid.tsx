"use client";

import { Stamp } from "lucide-react";
import { formatYMD } from "@/lib/dateUtils";

export type StampSlotStamp = { stampDate: string };

type Props = {
  /** 현재 장 기준으로 채워진 칸 수 (0~10). 누적 쿠폰 수가 아니라 한 장의 진행도일 때 사용. */
  filledCount: number;
  /** 채워진 칸에 마우스 올릴 때 날짜 툴팁 (길이는 filledCount 이하 권장) */
  stamps?: StampSlotStamp[];
  size?: "sm" | "md";
  className?: string;
};

/**
 * 스탬프 10칸 그리드. 별(★) 대신 스탬프 아이콘으로 표시.
 */
export function StampSlotGrid({ filledCount, stamps, size = "md", className = "" }: Props) {
  const n = Math.min(10, Math.max(0, filledCount));
  const box = size === "sm" ? "w-6 h-6 min-w-[1.5rem]" : "w-8 h-8 min-w-[2rem]";
  const iconSize = size === "sm" ? 12 : 15;

  return (
    <div
      className={`flex flex-wrap gap-1.5 ${className}`}
      role="list"
      aria-label={`스탬프 ${n}칸`}
    >
      {Array.from({ length: 10 }).map((_, i) => {
        const filled = i < n;
        const dateStr = filled && stamps?.[i]?.stampDate ? formatYMD(stamps[i]!.stampDate) : undefined;
        return (
          <span
            key={i}
            role="listitem"
            title={dateStr ?? (filled ? "스탬프" : "빈 칸")}
            className={`${box} rounded-md flex items-center justify-center border-2 transition-colors ${
              filled
                ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                : "border-dashed border-gray-300 bg-white text-gray-300"
            }`}
          >
            <Stamp
              size={iconSize}
              strokeWidth={filled ? 2.2 : 1.4}
              className={filled ? "text-white" : "text-gray-400"}
              aria-hidden
            />
          </span>
        );
      })}
    </div>
  );
}

"use client";

import { Stamp } from "lucide-react";
import { formatYMD } from "@/lib/dateUtils";

export type StampSlotStamp = { stampDate: string };

type Props = {
  /** 현재 장 기준으로 채워진 칸 수 (0~8). 누적 쿠폰 수가 아니라 한 장의 진행도일 때 사용. */
  filledCount: number;
  /** 채워진 칸에 마우스 올릴 때 날짜 툴팁 (길이는 filledCount 이하 권장) */
  stamps?: StampSlotStamp[];
  size?: "sm" | "md";
  className?: string;
};

/**
 * 스탬프 8칸 그리드 (4×2). 칸은 가로 폭에 맞춰 키우고, 아이콘은 칸 안에서 비율·상한으로 스케일.
 */
export function StampSlotGrid({ filledCount, stamps, size = "md", className = "" }: Props) {
  const n = Math.min(8, Math.max(0, filledCount));
  const gap = size === "sm" ? "gap-1.5" : "gap-1.5 sm:gap-2 md:gap-2";
  const cellPad = size === "sm" ? "p-1" : "p-1 sm:p-1.5 md:p-1.5";
  const rounded = size === "sm" ? "rounded-md" : "rounded-lg";
  const iconClass =
    size === "sm"
      ? "h-[52%] w-[52%] min-h-2.5 min-w-2.5 max-h-4 max-w-4"
      : "h-[50%] w-[50%] min-h-2.5 min-w-2.5 max-h-8 max-w-8 sm:max-h-9 sm:max-w-9 md:max-h-9 md:max-w-9";

  return (
    <div
      className={`grid w-full grid-cols-4 grid-rows-2 ${gap} ${className}`}
      role="list"
      aria-label={`스탬프 ${n}칸`}
    >
      {Array.from({ length: 8 }).map((_, i) => {
        const filled = i < n;
        const dateStr = filled && stamps?.[i]?.stampDate ? formatYMD(stamps[i]!.stampDate) : undefined;
        return (
          <span
            key={i}
            role="listitem"
            title={dateStr ?? (filled ? "스탬프" : "빈 칸")}
            className={`${cellPad} ${rounded} flex aspect-square w-full min-w-0 items-center justify-center border-2 transition-colors ${
              filled
                ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                : "border-dashed border-gray-300 bg-white text-gray-300"
            }`}
          >
            <Stamp
              strokeWidth={filled ? 2.2 : 1.4}
              className={`shrink-0 ${iconClass} ${filled ? "text-white" : "text-gray-400"}`}
              aria-hidden
            />
          </span>
        );
      })}
    </div>
  );
}

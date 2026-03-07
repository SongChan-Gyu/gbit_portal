"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/** 모바일: 요약만 보이고 탭 시 상세 펼침. 데스크톱: 항상 전체 표시 */
export default function ExpandablePanel({
  summary,
  detail,
  borderColor = "slate",
  className = "",
}: {
  summary: React.ReactNode;
  detail: React.ReactNode;
  borderColor?: "slate" | "amber";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const borderCls = borderColor === "amber" ? "border-amber-600" : "border-slate-500";

  return (
    <div className={`panel border-l-4 ${borderCls} ${className}`}>
      {/* 데스크톱: 헤더+본문 항상 표시 */}
      <div className="hidden md:block">
        <div className="panel-header">{summary}</div>
        {detail}
      </div>
      {/* 모바일: 요약만 보이고 탭 시 상세 펼침 */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full text-left panel-header flex items-center justify-between gap-2 touch-manipulation cursor-pointer"
          aria-expanded={open}
        >
          <span className="flex-1 min-w-0">{summary}</span>
          <span className="shrink-0 text-gray-400">
            {open ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
          </span>
        </button>
        {open && <div className="border-t border-gray-200">{detail}</div>}
      </div>
    </div>
  );
}

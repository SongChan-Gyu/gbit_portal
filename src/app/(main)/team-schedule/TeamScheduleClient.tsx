"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

type DayStatus = "AM" | "PM" | "FULL" | null;

const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];

const STATUS_CONFIG = {
  FULL: { label: "휴가", bg: "bg-red-100",    text: "text-red-700",    border: "border-red-200"   },
  AM:   { label: "오전휴무", bg: "bg-amber-100", text: "text-amber-700",  border: "border-amber-200" },
  PM:   { label: "오후휴무", bg: "bg-blue-100",  text: "text-blue-700",   border: "border-blue-200"  },
};

interface Member {
  id: string;
  name: string;
  position: string;
  isMe: boolean;
}

export default function TeamScheduleClient({
  members, weekDates, schedule, todayStr, weekOffset,
}: {
  members: Member[];
  weekDates: string[];
  schedule: Record<string, Record<string, DayStatus>>;
  todayStr: string;
  weekOffset: number;
}) {
  const router = useRouter();

  function shiftWeek(delta: number) {
    const next = weekOffset + delta;
    router.push(`/team-schedule${next !== 0 ? `?w=${next}` : ""}`);
  }

  const weekLabel = (() => {
    const start = new Date(weekDates[0]);
    const end   = new Date(weekDates[4]); // 금요일까지만
    return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 (월) ~ ${end.getMonth() + 1}월 ${end.getDate()}일 (금)`;
  })();

  return (
    <div className="space-y-4">
      {/* 주간 네비 */}
      <div className="card flex items-center justify-between py-3">
        <button onClick={() => shiftWeek(-1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-800">{weekLabel}</p>
          {weekOffset !== 0 && (
            <button onClick={() => router.push("/team-schedule")}
              className="text-xs text-blue-500 hover:underline mt-0.5">이번 주로</button>
          )}
        </div>
        <button onClick={() => shiftWeek(1)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            <span className="font-semibold">{cfg.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-gray-50 text-gray-500 border-gray-200">
          <span>출근</span>
        </div>
      </div>

      {/* 일정 테이블 */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-32">이름</th>
              {weekDates.map((d, i) => {
                const isWeekend = i >= 5;
                const isToday   = d === todayStr;
                return (
                  <th key={d} className={`px-2 py-3 text-center text-xs font-semibold w-16 ${
                    isToday ? "text-blue-600" : isWeekend ? "text-gray-400" : "text-gray-600"
                  }`}>
                    <div>{DAY_NAMES[i]}</div>
                    <div className={`text-[11px] mt-0.5 font-normal ${isToday ? "font-bold" : ""}`}>
                      {new Date(d).getDate()}
                    </div>
                    {isToday && <div className="w-1 h-1 rounded-full bg-blue-500 mx-auto mt-0.5" />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {members.map((m, mi) => (
              <tr key={m.id}
                className={`border-b border-gray-50 transition-colors ${
                  m.isMe ? "bg-blue-50/40" : mi % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                } hover:bg-gray-50`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      m.isMe ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {m.name[0]}
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${m.isMe ? "text-blue-700" : "text-gray-800"}`}>
                        {m.name} {m.isMe && <span className="text-blue-400 font-normal">(나)</span>}
                      </p>
                      <p className="text-[10px] text-gray-400">{m.position}</p>
                    </div>
                  </div>
                </td>
                {weekDates.map((d, i) => {
                  const status = schedule[m.id]?.[d] ?? null;
                  const isWeekend = i >= 5;
                  const cfg = status ? STATUS_CONFIG[status] : null;
                  return (
                    <td key={d} className={`px-2 py-3 text-center ${isWeekend ? "opacity-40" : ""}`}>
                      {cfg ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded-md text-[11px] font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          {cfg.label}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-10 text-sm text-gray-400">팀원이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 안내 */}
      <p className="text-xs text-gray-400 px-1">
        * 승인된 휴가만 표시됩니다. 휴가 유형은 개인정보 보호를 위해 표시되지 않습니다.
      </p>
    </div>
  );
}

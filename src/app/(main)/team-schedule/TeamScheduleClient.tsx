"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildHolidayDisplaySet,
  isRedCalendarDay,
  CALENDAR_HOLIDAY_COLOR,
} from "@/lib/calendarHolidayDisplay";

type DayStatus = "AM" | "PM" | "FULL" | null;

const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];
const DAY_NAMES_CAL = ["일", "월", "화", "수", "목", "금", "토"];

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

const STATUS_LABEL: Record<Exclude<DayStatus, null>, string> = {
  FULL: "휴가",
  AM: "오전",
  PM: "오후",
};

export default function TeamScheduleClient({
  view,
  members,
  weekDates,
  monthYear,
  monthDates,
  schedule,
  byDay,
  holidayYmds,
  todayStr,
  weekOffset,
  isAdminOrPm = false,
}: {
  view: "week" | "month";
  members: Member[];
  weekDates: string[];
  monthYear: { year: number; month: number };
  monthDates: string[];
  schedule: Record<string, Record<string, DayStatus>>;
  byDay: Record<string, { name: string; status: DayStatus }[]>;
  holidayYmds: string[];
  todayStr: string;
  weekOffset: number;
  isAdminOrPm?: boolean;
}) {
  const router = useRouter();
  const holidaySet = useMemo(() => buildHolidayDisplaySet(holidayYmds), [holidayYmds]);

  function shiftWeek(delta: number) {
    const next = weekOffset + delta;
    router.push(`/team-schedule?view=week${next !== 0 ? `&w=${next}` : ""}`);
  }

  function shiftMonth(delta: number) {
    let y = monthYear.year;
    let m = monthYear.month + delta;
    if (m > 12) { y++; m = 1; }
    if (m < 1) { y--; m = 12; }
    router.push(`/team-schedule?view=month&y=${y}&m=${m}`);
  }

  const weekLabel = (() => {
    const start = new Date(weekDates[0]);
    const end   = new Date(weekDates[4]);
    return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 (월) ~ ${end.getMonth() + 1}월 ${end.getDate()}일 (금)`;
  })();

  const monthLabel = `${monthYear.year}년 ${monthYear.month}월`;

  // 월간 달력: 첫 날의 요일(0=일)과 해당 월 일수
  const firstDayOfWeek = new Date(monthYear.year, monthYear.month - 1, 1).getDay();
  const calendarPadding: null[] = Array(firstDayOfWeek).fill(null);
  const calendarDays: (string | null)[] = [...calendarPadding, ...monthDates];

  return (
    <div className="space-y-4">
      {/* 뷰 전환 + 주간/월간 네비 */}
      <div className="card flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2">
          <a
            href="/team-schedule?view=week"
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === "week" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            주간
          </a>
          <a
            href={`/team-schedule?view=month&y=${monthYear.year}&m=${monthYear.month}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === "month" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            월간
          </a>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => view === "week" ? shiftWeek(-1) : shiftMonth(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center min-w-[200px]">
            <p className="text-sm font-semibold text-gray-800">{view === "week" ? weekLabel : monthLabel}</p>
            {view === "week" && weekOffset !== 0 && (
              <button onClick={() => router.push("/team-schedule?view=week")} className="text-xs text-blue-500 hover:underline mt-0.5">이번 주로</button>
            )}
            {view === "month" && (monthYear.year !== new Date().getFullYear() || monthYear.month !== new Date().getMonth() + 1) && (
              <button onClick={() => { const n = new Date(); router.push(`/team-schedule?view=month&y=${n.getFullYear()}&m=${n.getMonth() + 1}`); }} className="text-xs text-blue-500 hover:underline mt-0.5">이번 달로</button>
            )}
          </div>
          <button
            onClick={() => view === "week" ? shiftWeek(1) : shiftMonth(1)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
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

      {view === "month" ? (
        /* 월간 달력 */
        <div className="card overflow-x-auto p-0">
          <div className="grid grid-cols-7 text-sm">
            {DAY_NAMES_CAL.map((d, wi) => (
              <div
                key={d}
                className={`text-center py-2 font-medium border-b border-gray-100 ${
                  wi === 0 ? "text-red-600" : "text-gray-500"
                }`}
              >
                {d}
              </div>
            ))}
            {calendarDays.map((dateStr, i) => {
              if (dateStr === null) return <div key={`pad-${i}`} className="min-h-[80px] bg-gray-50/50" />;
              const isToday = dateStr === todayStr;
              const list = byDay[dateStr] ?? [];
              const dayNum = parseInt(dateStr.slice(8, 10), 10);
              const [cy, cm, cd] = dateStr.split("-").map((x) => parseInt(x, 10));
              const dayOfWeek = new Date(cy, cm - 1, cd).getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const isRedDay = !isToday && isRedCalendarDay(dateStr, holidaySet);
              return (
                <div
                  key={dateStr}
                  className={`min-h-[80px] border-b border-r border-gray-100 p-1.5 ${isWeekend ? "bg-gray-50/50" : "bg-white"}`}
                >
                  <div
                    className={`text-xs font-semibold mb-1 ${
                      isToday ? "text-blue-600" : isRedDay ? "" : "text-gray-700"
                    }`}
                    style={isRedDay ? { color: CALENDAR_HOLIDAY_COLOR } : undefined}
                  >
                    {dayNum}
                    {isToday && <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 inline-block align-middle" />}
                  </div>
                  <div className="space-y-0.5">
                    {(isAdminOrPm ? list : list.slice(0, 5)).map((x, j) => {
                      const cfg = x.status != null ? STATUS_CONFIG[x.status] : null;
                      const label = x.status != null ? STATUS_LABEL[x.status] : "";
                      return (
                        <div
                          key={j}
                          className={`text-[10px] px-1 py-0.5 rounded truncate border ${cfg?.bg ?? ""} ${cfg?.text ?? ""} ${cfg?.border ?? ""}`}
                          title={`${x.name} ${label}`}
                        >
                          {x.name} {label}
                        </div>
                      );
                    })}
                    {!isAdminOrPm && list.length > 5 && (
                      <div className="text-[10px] text-gray-500">+{list.length - 5}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* 주간 일정 테이블 */
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-32">이름</th>
                {weekDates.map((d, i) => {
                  const isWeekend = i >= 5;
                  const isToday   = d === todayStr;
                  const wd = parseInt(d.slice(8, 10), 10);
                  const isRedHeader = !isToday && isRedCalendarDay(d, holidaySet);
                  return (
                    <th key={d} className={`px-2 py-3 text-center text-xs font-semibold w-16 ${
                      isToday ? "text-blue-600" : isRedHeader ? "" : isWeekend ? "text-gray-400" : "text-gray-600"
                    }`}>
                      <div>{DAY_NAMES[i]}</div>
                      <div
                        className={`text-[11px] mt-0.5 font-normal ${isToday ? "font-bold" : ""}`}
                        style={isRedHeader ? { color: CALENDAR_HOLIDAY_COLOR } : undefined}
                      >
                        {wd}
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
      )}

      {/* 안내 */}
      <p className="text-xs text-gray-400 px-1">
        * 승인된 휴가만 표시됩니다. 휴가 유형은 개인정보 보호를 위해 표시되지 않습니다.
      </p>
    </div>
  );
}

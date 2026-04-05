"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { Calendar } from "lucide-react";
import { useHolidaySet } from "@/hooks/useHolidaySet";

interface Props {
  value: string;           // YYYY-MM-DD
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  min?: string;            // YYYY-MM-DD
  max?: string;
  /** 외부에서 직접 공휴일 Set을 주입할 때 (없으면 내부에서 자동 fetch) */
  holidaySet?: Set<string>;
  disabled?: boolean;
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export default function DatePickerButton({
  value,
  onChange,
  placeholder = "날짜 선택",
  className = "",
  min,
  max,
  holidaySet,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [calYear, setCalYear] = useState(() => {
    const d = value ? new Date(value) : new Date();
    return d.getFullYear();
  });
  const [calMonth, setCalMonth] = useState(() => {
    const d = value ? new Date(value) : new Date();
    return d.getMonth() + 1;
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 holidaySet 미제공 시 자동 fetch
  const fetchedHolidays = useHolidaySet(open ? calYear : undefined);
  const resolvedHolidaySet = useMemo(
    () => holidaySet ?? fetchedHolidays,
    [holidaySet, fetchedHolidays]
  );

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // value 바뀌면 달력 월도 이동
  useEffect(() => {
    if (!value) return;
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      setCalYear(d.getFullYear());
      setCalMonth(d.getMonth() + 1);
    }
  }, [value]);

  function toggle() {
    if (disabled) return;
    setOpen((v) => !v);
  }

  function prevMonth() {
    if (calMonth === 1) { setCalMonth(12); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  }
  function nextMonth() {
    if (calMonth === 12) { setCalMonth(1); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  }

  // 달력 셀 생성
  const firstDay = new Date(calYear, calMonth - 1, 1);
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const startPad = firstDay.getDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${calYear}-${String(calMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`input flex items-center justify-between gap-2 cursor-pointer text-sm w-full text-left ${
          disabled ? "opacity-50 cursor-not-allowed" : ""
        } ${className}`}
      >
        <span className={value ? "text-gray-800" : "text-gray-400"}>
          {value || placeholder}
        </span>
        <Calendar size={14} className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-64">
          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-600 font-bold text-base leading-none">‹</button>
            <span className="text-sm font-semibold tabular-nums">{calYear}년 {calMonth}월</span>
            <button type="button" onClick={nextMonth}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-600 font-bold text-base leading-none">›</button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-0.5 text-center mb-0.5">
            {WEEK.map((w, wi) => (
              <div key={w} className={`text-[10px] font-semibold py-0.5 ${wi === 0 || wi === 6 ? "text-red-400" : "text-gray-400"}`}>
                {w}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-0.5 text-center">
            {cells.map((ds, i) => {
              if (!ds) return <div key={`e-${i}`} />;
              const isSel = ds === value;
              const isDisabled = (min && ds < min) || (max && ds > max);
              const dow = new Date(calYear, calMonth - 1, parseInt(ds.slice(8))).getDay();
              const isSun = dow === 0;
              const isSat = dow === 6;
              const isHoliday = resolvedHolidaySet?.has(ds);
              const isRed = isSun || isHoliday;
              const dayNum = parseInt(ds.slice(8));

              return (
                <button key={ds} type="button"
                  disabled={!!isDisabled}
                  onClick={() => { onChange(ds); setOpen(false); }}
                  className={`aspect-square rounded-lg text-xs font-medium transition-colors ${
                    isSel
                      ? "bg-blue-600 text-white"
                      : isDisabled
                        ? "opacity-30 cursor-not-allowed"
                        : "hover:bg-gray-100"
                  }`}>
                  <span style={isSel ? {} : {
                    color: isRed ? "#ef4444" : isSat ? "#3b82f6" : "#111827",
                  }}>
                    {dayNum}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 공휴일 범례 */}
          <p className="text-[10px] text-red-400 mt-2 text-center">빨강 = 공휴일·일요일</p>
        </div>
      )}
    </div>
  );
}

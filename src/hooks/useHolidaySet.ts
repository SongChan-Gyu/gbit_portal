"use client";
import { useState, useEffect } from "react";

/**
 * 지정 연도의 공휴일 Set을 /api/public/holidays-kr 에서 가져옵니다.
 * year 가 바뀌면 자동으로 재요청합니다.
 */
export function useHolidaySet(year?: number): Set<string> {
  const targetYear = year ?? new Date().getFullYear();
  const [holidays, setHolidays] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/holidays-kr?year=${targetYear}`);
        const j = await res.json();
        const dates: string[] = Array.isArray(j.dates) ? j.dates : [];
        if (!cancelled) setHolidays(new Set(dates));
      } catch {
        if (!cancelled) setHolidays(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [targetYear]);

  return holidays;
}

/** 귀속연도 fy: 5/1(fy) ~ 4/30(fy+1) */
export function fiscalYearBounds(fy: number) {
  return {
    start: new Date(fy, 4, 1, 0, 0, 0, 0),
    end: new Date(fy + 1, 3, 30, 23, 59, 59, 999),
  };
}

/**
 * 휴가 항목 일수를 귀속 구간에 비율 배분 (경계를 넘는 신청 대비).
 * 달력일 수 비율 × item.days
 */
export function prorateLeaveDaysToFiscalYear(
  itemStart: Date,
  itemEnd: Date,
  days: number,
  fy: number,
): number {
  if (days <= 0) return 0;
  const { start: fyS, end: fyE } = fiscalYearBounds(fy);
  const s = new Date(itemStart);
  const e = new Date(itemEnd);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  const fyStart = new Date(fyS);
  fyStart.setHours(0, 0, 0, 0);
  const fyEndDay = new Date(fyE);
  fyEndDay.setHours(0, 0, 0, 0);
  if (e < fyStart || s > fyEndDay) return 0;
  const os = s > fyStart ? s : fyStart;
  const oe = e < fyEndDay ? e : fyEndDay;
  const msDay = 86400000;
  const spanTotal = Math.max(1, Math.round((e.getTime() - s.getTime()) / msDay) + 1);
  const spanOverlap = Math.max(0, Math.round((oe.getTime() - os.getTime()) / msDay) + 1);
  return days * (spanOverlap / spanTotal);
}

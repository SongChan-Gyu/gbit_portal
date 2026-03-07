/**
 * 제주도 숙소: 직급부서가 복지부인 사람만 승인 가능 (dutyDept === "WELFARE")
 */
export function isWelfareDept(emp: { dutyDept?: string | null } | null): boolean {
  if (!emp) return false;
  return emp.dutyDept === "WELFARE";
}

/** 1박 = endDate > startDate (날짜 기준). 밤을 하루 씩 세면 endDate - startDate >= 1 */
export function calcNights(startDate: Date, endDate: Date): number {
  const s = new Date(startDate);
  const e = new Date(endDate);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)));
}

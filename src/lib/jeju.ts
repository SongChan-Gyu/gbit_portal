/**
 * 제주도 숙소: 직급부서가 복지부인 사람만 승인 가능 (dutyDept === "WELFARE")
 */
export function isWelfareDept(emp: { dutyDept?: string | null } | null): boolean {
  if (!emp) return false;
  return emp.dutyDept === "WELFARE";
}

/** 1박 = endDate > startDate (날짜 기준). 입실 15시·퇴실 11시 고정 */
export function calcNights(startDate: Date, endDate: Date): number {
  const s = new Date(startDate);
  const e = new Date(endDate);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)));
}

/** 예약 가능 기간: 매월 1일 기준 2달 후 말일까지가 예약 시작일(입실일) 한도. ex) 3월 → 5/31까지 시작일 가능 */
export function getJejuBookingWindowEnd(): Date {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  const end = new Date(y, m + 2 + 1, 0); // 현재 월 + 2 의 말일 (예약 시작일 한도)
  end.setHours(23, 59, 59, 999);
  return end;
}

/** 예약 시작일(입실일)이 한도 이내인지. 매월 1일 기준 2달 후 말일 이내만 신청 가능 */
export function isJejuDateBookable(startDate: Date): boolean {
  const end = getJejuBookingWindowEnd();
  const s = new Date(startDate);
  s.setHours(0, 0, 0, 0);
  return s <= end;
}

/** 최대 연박 수 (시스템 설정, 기본 14) */
export const JEJU_MAX_NIGHTS_DEFAULT = 14;

/** 예약금 고정 10만원 */
export const JEJU_DEPOSIT_AMOUNT = 100_000;

/** 기본 입금 계좌 (복지부가 시스템에서 변경 가능) */
export const JEJU_DEPOSIT_ACCOUNT_DEFAULT = {
  bankName: "신한은행",
  accountHolder: "이기광",
  accountNumber: "1105423446194",
} as const;

export type JejuDepositAccount = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
};

/** 계좌번호 포맷 (110-542-3446194) */
export function formatJejuAccountNumber(num: string): string {
  const n = num.replace(/\D/g, "");
  if (n.length <= 3) return n;
  if (n.length <= 5) return `${n.slice(0, 3)}-${n.slice(3)}`;
  return `${n.slice(0, 3)}-${n.slice(3, 5)}-${n.slice(5)}`;
}

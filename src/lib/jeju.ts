import { addDaysYMD, eachYmdInHalfOpenRange, kstYmd, todayKstYmd } from "@/lib/dateUtils";
import { kstEndOfDay, kstMidnightFromYmd } from "@/lib/workdays";

/**
 * 제주도 숙소: 직급부서가 복지부인 사람만 승인 가능 (dutyDept === "WELFARE")
 */
export function isWelfareDept(emp: { dutyDept?: string | null } | null): boolean {
  if (!emp) return false;
  return emp.dutyDept === "WELFARE";
}

/** 1박 = endDate > startDate (KST 달력일 기준). 입실 15시·퇴실 11시 고정 */
export function calcNights(startDate: Date, endDate: Date): number {
  let n = 0;
  let cur = kstYmd(startDate);
  const end = kstYmd(endDate);
  while (cur < end) {
    n++;
    cur = addDaysYMD(cur, 1);
  }
  return n;
}

/**
 * 예약 가능 기간 말일 YYYY-MM-DD: 매월 1일 기준 2달 후 말일까지가 예약 시작일(입실일) 한도.
 * (한국 달력 기준, 서버 TZ와 무관)
 */
export function getJejuBookingWindowEndYmd(): string {
  const [y, m] = todayKstYmd().split("-").map(Number);
  let ty = y;
  let tm = m + 2;
  while (tm > 12) {
    tm -= 12;
    ty++;
  }
  const lastD = new Date(ty, tm, 0).getDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(lastD).padStart(2, "0")}`;
}

/** 예약 가능 기간 말일 23:59:59.999 KST */
export function getJejuBookingWindowEnd(): Date {
  const ymd = getJejuBookingWindowEndYmd();
  const [yy, mm, dd] = ymd.split("-").map(Number);
  return kstEndOfDay(yy, mm, dd);
}

/** 예약 시작일(입실일)이 한도 이내인지. 매월 1일 기준 2달 후 말일 이내만 신청 가능 */
export function isJejuDateBookable(startDate: Date): boolean {
  return kstYmd(startDate) <= getJejuBookingWindowEndYmd();
}

/** [입실, 퇴실) 구간에 블록 YMD가 하나라도 걸치면 true */
export function jejuPeriodTouchesBlockedYmds(
  startDate: Date,
  endDate: Date,
  blockedYmds: string[],
): boolean {
  const set = new Set(blockedYmds);
  for (const ymd of eachYmdInHalfOpenRange(kstYmd(startDate), kstYmd(endDate))) {
    if (set.has(ymd)) return true;
  }
  return false;
}

/** 입실·퇴실 문자열(YYYY-MM-DD) → KST 자정 Date (Prisma 저장용) */
export function jejuKstMidnightFromYmdStr(ymd: string): Date {
  return kstMidnightFromYmd(ymd.slice(0, 10));
}

/** 최대 연박 수 (시스템 설정, 기본 7) */
export const JEJU_MAX_NIGHTS_DEFAULT = 7;

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

/** 예약금 이체 안내 한 줄 (은행 예금주 계좌) */
export function formatJejuDepositAccountLine(account: JejuDepositAccount): string {
  return `${account.bankName} ${account.accountHolder} ${formatJejuAccountNumber(account.accountNumber)}`;
}

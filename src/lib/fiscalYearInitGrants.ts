import { fiscalPeriod } from "@/lib/leaveCalc";
import { kstYmd } from "@/lib/dateUtils";
import { kstMidnightFromYmd } from "@/lib/workdays";

/** 귀속연도 구간 안에 들어오는 생일(달력일) 목록 — KST 달력·윤년 보정 */
export function birthdayInstancesInFiscalYear(fy: number, birthDate: Date): {
  birthdayThisYear: Date;
  birthdayDateStr: string;
}[] {
  const { start: fyStart, end: fyEnd } = fiscalPeriod(fy);
  const fyStartYmd = kstYmd(fyStart);
  const fyEndYmd = kstYmd(fyEnd);
  const birthYmd = kstYmd(birthDate);
  const [, birthM, birthD] = birthYmd.split("-").map(Number);
  const out: { birthdayThisYear: Date; birthdayDateStr: string }[] = [];
  for (const Y of [fy, fy + 1] as const) {
    const maxDay = new Date(Y, birthM, 0).getDate();
    const safeDay = Math.min(birthD, maxDay);
    const birthdayDateStr = `${Y}-${String(birthM).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
    const birthdayThisYear = kstMidnightFromYmd(birthdayDateStr);
    const bYmd = birthdayDateStr;
    if (bYmd < fyStartYmd || bYmd > fyEndYmd) continue;
    out.push({ birthdayThisYear, birthdayDateStr });
  }
  return out;
}

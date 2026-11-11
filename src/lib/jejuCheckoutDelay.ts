import type { DB, DBTx } from "@/lib/db";
import { kstYmd, todayKstYmd } from "@/lib/dateUtils";

export const JEJU_OCCUPYING_STATUSES = ["PENDING", "STEP1_APPROVED", "APPROVED"] as const;
export const JEJU_CHECKIN_TIME = "16:00";
export const JEJU_CHECKOUT_BASE_HOUR = 11;

type JejuDb = DB | DBTx;

export function parseCheckoutDelayHours(v: unknown): 0 | 1 | 2 | 3 | null {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  return null;
}

/** 기본 11:00, 지연 1·2·3시간이면 12:00·13:00·14:00 */
export function jejuCheckoutTimeLabel(delayHours: number): string {
  const extra = delayHours === 1 || delayHours === 2 || delayHours === 3 ? delayHours : 0;
  return `${String(JEJU_CHECKOUT_BASE_HOUR + extra).padStart(2, "0")}:00`;
}

/** 퇴실일 당일(KST)부터는 퇴실 지연을 바꿀 수 없음 */
export function isJejuCheckoutDelayLocked(endDate: Date, todayYmd: string = todayKstYmd()): boolean {
  return todayYmd >= kstYmd(endDate);
}

export async function jejuHasCheckInOnDate(
  db: JejuDb,
  checkInDate: Date,
  exceptId?: string,
): Promise<boolean> {
  const row = await db.jejuAccommodation.findFirst({
    where: {
      ...(exceptId ? { id: { not: exceptId } } : {}),
      status: { in: [...JEJU_OCCUPYING_STATUSES] },
      startDate: checkInDate,
    },
    select: { id: true },
  });
  return Boolean(row);
}

/** 해당일에 입실하는 예약이 생기면, 그날 퇴실 지연을 모두 0시간으로 되돌림 */
export async function clearJejuCheckoutDelayForCheckInDate(
  db: JejuDb,
  checkInDate: Date,
  exceptId?: string,
): Promise<void> {
  await db.jejuAccommodation.updateMany({
    where: {
      ...(exceptId ? { id: { not: exceptId } } : {}),
      status: { in: [...JEJU_OCCUPYING_STATUSES] },
      endDate: checkInDate,
      checkoutDelayHours: { gt: 0 },
    },
    data: { checkoutDelayHours: 0 },
  });
}

/** 퇴실 당일 입실 예약이 있는 건의 지연을 0시간으로 맞춤. 되돌린 id 집합을 반환 */
export async function resetJejuCheckoutDelaysWhenCheckInExists(
  db: JejuDb,
  rows: { id: string; endDate: Date; checkoutDelayHours: number }[],
): Promise<Set<string>> {
  const delayed = rows.filter((r) => r.checkoutDelayHours > 0);
  if (delayed.length === 0) return new Set();
  const checkIns = await db.jejuAccommodation.findMany({
    where: {
      status: { in: [...JEJU_OCCUPYING_STATUSES] },
      startDate: { in: delayed.map((r) => r.endDate) },
    },
    select: { id: true, startDate: true },
  });
  const resetIds = delayed
    .filter((r) =>
      checkIns.some((c) => c.id !== r.id && c.startDate.getTime() === r.endDate.getTime()),
    )
    .map((r) => r.id);
  if (resetIds.length > 0) {
    await db.jejuAccommodation.updateMany({
      where: { id: { in: resetIds } },
      data: { checkoutDelayHours: 0 },
    });
  }
  return new Set(resetIds);
}

export function jejuCheckoutDelayHoursLabel(hours: number): string {
  const n = hours === 1 || hours === 2 || hours === 3 ? hours : 0;
  return `${n}시간`;
}

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getJejuBookingWindowEnd, JEJU_MAX_NIGHTS_DEFAULT, JEJU_DEPOSIT_AMOUNT, JEJU_DEPOSIT_ACCOUNT_DEFAULT, type JejuDepositAccount } from "@/lib/jeju";

/** GET /api/jeju/config - 예약 규칙, 예약금·계좌, 예약 불가일 */
export async function GET() {
  let maxNights = JEJU_MAX_NIGHTS_DEFAULT;
  let depositAccount: JejuDepositAccount = { ...JEJU_DEPOSIT_ACCOUNT_DEFAULT };
  let blockedDates: string[] = [];

  try {
    const [maxNightsConfig, accountConfig, blockedConfig] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: "jejuMaxNights" } }),
      prisma.systemConfig.findUnique({ where: { key: "jejuDepositAccount" } }),
      prisma.systemConfig.findUnique({ where: { key: "jejuBlockedDates" } }),
    ]);
    if (maxNightsConfig?.value) {
      const n = parseInt(maxNightsConfig.value, 10);
      if (!isNaN(n) && n >= 1) maxNights = n;
    }
    if (accountConfig?.value) {
      try {
        const parsed = JSON.parse(accountConfig.value) as JejuDepositAccount;
        if (parsed.bankName && parsed.accountHolder && parsed.accountNumber) {
          depositAccount = parsed;
        }
      } catch {
        // keep default
      }
    }
    if (blockedConfig?.value) {
      try {
        const arr = JSON.parse(blockedConfig.value);
        if (Array.isArray(arr)) blockedDates = arr.filter((x) => typeof x === "string");
      } catch {
        // keep []
      }
    }
  } catch {
    // ignore
  }

  const bookingWindowEnd = getJejuBookingWindowEnd();
  return NextResponse.json({
    maxNights,
    checkIn: "15:00",
    checkOut: "11:00",
    bookingWindowEnd: bookingWindowEnd.toISOString().slice(0, 10),
    depositAmount: JEJU_DEPOSIT_AMOUNT,
    depositAccount,
    blockedDates,
  });
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import { JEJU_DEPOSIT_ACCOUNT_DEFAULT, type JejuDepositAccount } from "@/lib/jeju";

/** 복지부 또는 PM/ADMIN만 접근 */
async function canManageJejuSettings(user: { employeeId?: string; role?: string }) {
  if (user.role === "PM" || user.role === "ADMIN") return true;
  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true },
  });
  return isWelfareDept(emp);
}

/** GET - 예약금 계좌, 예약 불가일 목록 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (!(await canManageJejuSettings(user))) {
    return NextResponse.json({ error: "복지부 또는 관리자만 조회할 수 있습니다." }, { status: 403 });
  }

  let depositAccount: JejuDepositAccount = { ...JEJU_DEPOSIT_ACCOUNT_DEFAULT };
  let blockedDates: string[] = [];
  try {
    const [accountConfig, blockedConfig] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: "jejuDepositAccount" } }),
      prisma.systemConfig.findUnique({ where: { key: "jejuBlockedDates" } }),
    ]);
    if (accountConfig?.value) {
      const parsed = JSON.parse(accountConfig.value) as JejuDepositAccount;
      if (parsed.bankName && parsed.accountHolder && parsed.accountNumber) depositAccount = parsed;
    }
    if (blockedConfig?.value) {
      const arr = JSON.parse(blockedConfig.value);
      if (Array.isArray(arr)) blockedDates = arr.filter((x: unknown) => typeof x === "string");
    }
  } catch {
    // keep defaults
  }
  return NextResponse.json({ depositAccount, blockedDates });
}

/** PATCH - 예약금 계좌, 예약 불가일 저장 */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (!(await canManageJejuSettings(user))) {
    return NextResponse.json({ error: "복지부 또는 관리자만 수정할 수 있습니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as {
    depositAccount?: JejuDepositAccount;
    blockedDates?: string[];
  };

  if (body.depositAccount != null) {
    const { bankName, accountHolder, accountNumber } = body.depositAccount;
    if (typeof bankName !== "string" || !bankName.trim() || typeof accountHolder !== "string" || !accountHolder.trim() || typeof accountNumber !== "string" || !accountNumber.trim()) {
      return NextResponse.json({ error: "은행명, 예금주, 계좌번호를 모두 입력해 주세요." }, { status: 400 });
    }
    await prisma.systemConfig.upsert({
      where: { key: "jejuDepositAccount" },
      create: { key: "jejuDepositAccount", value: JSON.stringify({ bankName: bankName.trim(), accountHolder: accountHolder.trim(), accountNumber: accountNumber.replace(/\D/g, "") }) },
      update: { value: JSON.stringify({ bankName: bankName.trim(), accountHolder: accountHolder.trim(), accountNumber: accountNumber.replace(/\D/g, "") }) },
    });
  }

  if (body.blockedDates != null) {
    if (!Array.isArray(body.blockedDates)) {
      return NextResponse.json({ error: "blockedDates는 날짜 배열(YYYY-MM-DD)이어야 합니다." }, { status: 400 });
    }
    const valid = body.blockedDates.filter((x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x));
    await prisma.systemConfig.upsert({
      where: { key: "jejuBlockedDates" },
      create: { key: "jejuBlockedDates", value: JSON.stringify(valid) },
      update: { value: JSON.stringify(valid) },
    });
  }

  return NextResponse.json({ ok: true });
}

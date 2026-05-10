import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { sendJejuDepositReminderAlimtalk } from "@/lib/kakao";
import { writeAudit, getIp } from "@/lib/audit";

/**
 * POST /api/jeju/admin/deposit-reminder
 * Body: { jejuId: string; depositInfo: string }
 * PM/ADMIN이 특정 제주 신청자에게 입금 안내 알림톡 발송.
 */
export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user);
  if (guard) return guard;

  const body = await req.json() as { jejuId?: string; depositInfo?: string };
  const { jejuId, depositInfo } = body;

  if (!jejuId) return NextResponse.json({ error: "jejuId 필요" }, { status: 400 });
  if (!depositInfo?.trim()) return NextResponse.json({ error: "입금 안내 내용을 입력해 주세요." }, { status: 400 });

  const jeju = await prisma.jejuAccommodation.findUnique({
    where: { id: jejuId },
    include: {
      employee: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!jeju) return NextResponse.json({ error: "신청 내역을 찾을 수 없습니다." }, { status: 404 });
  if (!["STEP1_APPROVED", "APPROVED"].includes(jeju.status)) {
    return NextResponse.json({ error: "1차 승인 이상 상태에서만 발송 가능합니다." }, { status: 400 });
  }
  if (!jeju.employee.phone) {
    return NextResponse.json({ error: "신청자 전화번호가 없습니다." }, { status: 400 });
  }

  const startYMD = jeju.startDate.toISOString().slice(0, 10);
  const endYMD = jeju.endDate.toISOString().slice(0, 10);
  const period = `${startYMD} ~ ${endYMD} (${jeju.nights}박)`;

  await sendJejuDepositReminderAlimtalk(
    prisma,
    jeju.employee.id,
    jeju.employee.phone,
    jeju.employee.name,
    period,
    depositInfo.trim(),
  );

  await writeAudit({
    actorId: user.employeeId,
    action: "ALIMTALK_SENT",
    entityType: "JejuAccommodation",
    entityId: jejuId,
    note: `JEJU_DEPOSIT_REMINDER 발송 → ${jeju.employee.name} (${jeju.employee.phone})`,
    ip: getIp(req) ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

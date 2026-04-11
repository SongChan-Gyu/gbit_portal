import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { appendStampCouponToCard } from "@/lib/stampCard";
import { ADMIN_LEAVE_EMPLOYEE_STATUSES } from "@/lib/adminEmployeeScope";
import { kstMidnightFromYmd, todayStr } from "@/lib/workdays";

const MAX_GRANT = 30;

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as { role?: string; employeeId?: string } | undefined;
  const guard = requirePMOrAdmin(u);
  if (guard) return guard;

  let body: { employeeId?: string; count?: number; stampDateYmd?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const employeeId = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  const count = Number(body.count);
  if (!employeeId) {
    return NextResponse.json({ error: "직원을 선택해 주세요." }, { status: 400 });
  }
  if (!Number.isFinite(count) || count < 1 || count > MAX_GRANT) {
    return NextResponse.json(
      { error: `부여 칸 수는 1~${MAX_GRANT} 사이 정수여야 합니다.` },
      { status: 400 },
    );
  }

  const grantYmdStr =
    body.stampDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(body.stampDateYmd) ? body.stampDateYmd : todayStr();

  let stampDate: Date;
  if (body.stampDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(body.stampDateYmd)) {
    stampDate = kstMidnightFromYmd(body.stampDateYmd);
    if (Number.isNaN(stampDate.getTime())) {
      return NextResponse.json({ error: "부여일(날짜)이 올바르지 않습니다." }, { status: 400 });
    }
  } else {
    stampDate = kstMidnightFromYmd(grantYmdStr);
  }

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, status: { in: [...ADMIN_LEAVE_EMPLOYEE_STATUSES] } },
    select: { id: true, name: true },
  });
  if (!emp) {
    return NextResponse.json({ error: "대상 직원을 찾을 수 없습니다. (퇴직 등 제외)" }, { status: 404 });
  }

  /** 스탬프 적립과 감사 로그를 한 트랜잭션으로 — 로그 실패 시 부여만 되고 클라이언트는 실패로 보이는 불일치 방지 */
  try {
    const createdIds = await prisma.$transaction(
      async (tx) => {
        const ids: string[] = [];
        for (let i = 0; i < count; i++) {
          const { stampId } = await appendStampCouponToCard(tx, employeeId, stampDate);
          ids.push(stampId);
        }
        await tx.auditLog.create({
          data: {
            entityType: "StampCoupon",
            entityId: ids[0] ?? employeeId,
            action: "GRANTED",
            actorId: u?.employeeId ?? null,
            after: JSON.stringify({
              employeeId,
              employeeName: emp.name,
              granted: count,
              stampIds: ids,
              stampDateYmd: grantYmdStr,
            }),
            note: `관리자 스탬프 칸 수동 부여 ${count}칸`,
          },
        });
        return ids;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    const totalAfter = await prisma.stampCoupon.count({ where: { employeeId } });

    return NextResponse.json({
      ok: true,
      granted: count,
      totalStampCoupons: totalAfter,
      stampIds: createdIds,
    });
  } catch (e) {
    console.error("[stamp-grant]", e);
    const msg =
      e instanceof Error ? e.message : typeof e === "string" ? e : "알 수 없는 오류";
    return NextResponse.json(
      { error: `스탬프 부여 처리 중 오류가 났습니다. (${msg})` },
      { status: 500 },
    );
  }
}

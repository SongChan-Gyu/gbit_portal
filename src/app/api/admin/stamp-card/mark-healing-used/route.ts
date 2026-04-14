import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { employeeEligibleForAdminLeaveSetup } from "@/lib/adminEmployeeScope";

/**
 * PM·관리자: 실제로는 힐링을 썼는데 시스템에만 미반영된 경우 등,
 * 특정 스탬프 장의 힐링 권한만 소모 처리합니다. (휴가 신청·결재 없음)
 */
export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as { role?: string; employeeId?: string } | undefined;
  const guard = requirePMOrAdmin(u);
  if (guard) return guard;

  let body: { stampCardId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const stampCardId = typeof body.stampCardId === "string" ? body.stampCardId.trim() : "";
  if (!stampCardId) {
    return NextResponse.json({ error: "stampCardId가 필요합니다." }, { status: 400 });
  }

  const card = await prisma.stampCard.findUnique({
    where: { id: stampCardId },
    include: {
      employee: { select: { id: true, name: true, empNo: true, status: true } },
      _count: { select: { stamps: true } },
    },
  });
  if (!card || !employeeEligibleForAdminLeaveSetup(card.employee.status)) {
    return NextResponse.json({ error: "스탬프 장을 찾을 수 없습니다." }, { status: 404 });
  }

  const stampsOnCard = card._count.stamps;
  if (stampsOnCard < 4) {
    return NextResponse.json(
      { error: "힐링은 스탬프 4칸 이상인 장에서만 소모할 수 있습니다. 칸 수를 확인해 주세요." },
      { status: 400 },
    );
  }
  if (card.healingUsed) {
    return NextResponse.json({ error: "이 장은 이미 힐링이 소모된 상태입니다." }, { status: 400 });
  }

  const txResult = await prisma.$transaction(async (tx) => {
    const n = await tx.stampCard.updateMany({
      where: { id: stampCardId, healingUsed: false },
      data: {
        healingUsed: true,
        healingLeaveRequestId: null,
      },
    });
    if (n.count === 0) return false;
    await tx.auditLog.create({
      data: {
        entityType: "StampCard",
        entityId: stampCardId,
        action: "ADJUSTED",
        actorId: u?.employeeId ?? null,
        after: JSON.stringify({
          employeeId: card.employeeId,
          stampCardId,
          healingUsed: true,
          note: "관리자 힐링 권한 수동 소모",
        }),
        note: `${card.employee.name} (${card.employee.empNo}) 스탬프 장 힐링 수동 소모`,
      },
    });
    return true;
  });

  if (!txResult) {
    return NextResponse.json(
      { error: "이미 힐링이 소모되었거나 동시에 처리된 장입니다. 목록을 새로고침해 주세요." },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}

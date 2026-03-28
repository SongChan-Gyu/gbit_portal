import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { releaseStampSlotsForLeaveRequest } from "@/lib/stampCard";
import { sendLeaveWithdrawAlimtalk } from "@/lib/kakao";

function withdrawAlimtalkEnabled() {
  const v = process.env.LEAVE_WITHDRAW_ALIMTALK?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

/** pending = 아직 결재하지 않은 결재자만, all = 결재선의 모든 결재자(중복 제거) */
function withdrawAlimtalkScope(): "pending" | "all" {
  const s = process.env.LEAVE_WITHDRAW_ALIMTALK_SCOPE?.trim().toLowerCase();
  return s === "all" ? "all" : "pending";
}

function buildLeaveSummary(items: { leaveType: { name: string }; startDate: Date; endDate: Date }[]): string {
  const types = items.map((i) => i.leaveType.name).join("+");
  const s = items[0]?.startDate;
  const e = items[items.length - 1]?.endDate;
  if (!s || !e) return types;
  const a = s.toISOString().slice(0, 10);
  const b = e.toISOString().slice(0, 10);
  return `- 휴가유형: ${types}\n- 기간: ${a}${a !== b ? ` ~ ${b}` : ""}`;
}

/**
 * POST /api/leave/request/[id]/cancel
 * 승인 전 신청자 철회 → status WITHDRAWN (승인 후 취소는 cancel-request 등 별도 API)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: {
      items: { include: { leaveType: true } },
      approvals: { include: { approver: true } },
      employee: true,
    },
  });
  if (!request) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (request.employeeId !== user.employeeId)
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  if (request.status !== "PENDING")
    return NextResponse.json({ error: "대기 상태의 신청만 철회할 수 있습니다." }, { status: 400 });

  const scope = withdrawAlimtalkScope();
  const summary = buildLeaveSummary(request.items);

  const notifyApprovers = (() => {
    const map = new Map<string, { id: string; phone: string; name: string }>();
    for (const a of request.approvals) {
      if (scope === "pending" && a.status !== "PENDING") continue;
      if (scope === "all" && !["PENDING", "APPROVED"].includes(a.status)) continue;
      const emp = a.approver;
      if (!emp?.phone || emp.alimtalkEnabled === false) continue;
      map.set(emp.id, { id: emp.id, phone: emp.phone, name: emp.name });
    }
    return [...map.values()];
  })();

  await prisma.$transaction(async (tx) => {
    await tx.leaveApproval.updateMany({
      where: { leaveRequestId: id, status: "PENDING" },
      data: { status: "REJECTED", comment: "신청자 철회", approvedAt: new Date() },
    });
    await tx.leaveRequest.update({
      where: { id: request.id },
      data: { status: "WITHDRAWN", cancelledAt: new Date() },
    });
    await releaseStampSlotsForLeaveRequest(tx, request.id);
    await tx.leaveHistory.create({
      data: { leaveRequestId: request.id, action: "WITHDRAWN", actorId: user.employeeId },
    });
  });

  if (withdrawAlimtalkEnabled() && notifyApprovers.length > 0) {
    const applicantName = request.employee.name;
    for (const ap of notifyApprovers) {
      try {
        await sendLeaveWithdrawAlimtalk(
          prisma,
          ap.id,
          ap.phone,
          ap.name,
          applicantName,
          summary,
        );
      } catch (e) {
        console.warn("[leave/cancel] 철회 알림톡 실패", e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

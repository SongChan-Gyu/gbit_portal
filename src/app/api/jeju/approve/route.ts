import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept } from "@/lib/jeju";
import { writeAudit, getIp } from "@/lib/audit";

/** 복지부 또는 PM/ADMIN: 승인 또는 반려 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (user.role === "PM" || user.role === "ADMIN") {
    // 허용
  } else {
    const emp = await prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { dutyDept: true },
    });
    if (!isWelfareDept(emp)) {
      return NextResponse.json({ error: "복지부 또는 관리자만 승인/반려할 수 있습니다." }, { status: 403 });
    }
  }

  const body = await req.json();
  const { requestId, action, comment } = body as {
    requestId: string;
    action: "APPROVE" | "REJECT";
    comment?: string;
  };

  if (!requestId || !action) {
    return NextResponse.json({ error: "requestId, action 필요" }, { status: 400 });
  }
  if (action === "REJECT" && !comment?.trim()) {
    return NextResponse.json({ error: "반려 시 사유를 입력해 주세요." }, { status: 400 });
  }

  const row = await prisma.jejuAccommodation.findUnique({
    where: { id: requestId },
  });
  if (!row) return NextResponse.json({ error: "신청을 찾을 수 없습니다." }, { status: 404 });
  if (row.status !== "PENDING") {
    return NextResponse.json({ error: "이미 처리된 신청입니다." }, { status: 400 });
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (action === "APPROVE") {
      await tx.jejuAccommodation.update({
        where: { id: requestId },
        data: { status: "APPROVED", approvedById: user.employeeId, approvedAt: now },
      });
    } else {
      await tx.jejuAccommodation.update({
        where: { id: requestId },
        data: { status: "REJECTED", approvedById: user.employeeId, approvedAt: now, rejectComment: comment?.trim() || null },
      });
    }
  });

  await writeAudit({
    entityType: "JejuAccommodation",
    entityId: requestId,
    action: action === "APPROVE" ? "APPROVED" : "REJECTED",
    actorId: user.employeeId,
    after: { status: action === "APPROVE" ? "APPROVED" : "REJECTED" },
    ip: getIp(req) ?? undefined,
  });

  return NextResponse.json({ ok: true });
}

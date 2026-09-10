import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { toYMD } from "@/lib/dateUtils";
import { sendStampResultAlimtalk } from "@/lib/kakao";
import { createNotification } from "@/lib/notification";
import { appendStampCouponToCard } from "@/lib/stampCard";

type StampApplicant = {
  id: string;
  name: string;
  phone: string;
  alimtalkEnabled: boolean;
};

async function notifyStampApplicantResult(opts: {
  emp: StampApplicant;
  action: "APPROVE" | "REJECT";
  stampDate: Date;
  reason: string;
  comment?: string | null;
}) {
  const { emp, action, stampDate, reason, comment } = opts;
  const resultLabel = action === "APPROVE" ? "스탬프 승인" : "스탬프 반려";
  const ymd = toYMD(stampDate);

  try {
    await createNotification({
      employeeId: emp.id,
      type: action === "APPROVE" ? "STAMP_APPROVED" : "STAMP_REJECTED",
      body: `${resultLabel}${ymd ? ` (${ymd})` : ""}`,
      link: "/stamp",
    });
  } catch (e) {
    console.warn("[stamp/approve] 인앱 알림 생성 실패", e);
  }

  if (!emp.phone) return;
  if (emp.alimtalkEnabled === false) return;
  try {
    await sendStampResultAlimtalk(
      prisma,
      emp.id,
      emp.phone,
      emp.name,
      resultLabel,
      ymd,
      reason,
      comment ?? "",
    );
  } catch (alimErr) {
    console.warn("[stamp/approve] 알림톡 발송 실패 (스탬프 처리는 완료됨)", alimErr);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const { id, action, comment } = await req.json() as {
    id: string; action: "APPROVE" | "REJECT"; comment?: string;
  };

  const sr = await prisma.stampRequest.findUnique({ where: { id }, include: { employee: true } });
  if (!sr) return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
  if (sr.status !== "PENDING") return NextResponse.json({ error: "이미 처리된 요청입니다." }, { status: 400 });

  const actor = await prisma.employee.findUnique({ where: { id: user.employeeId } });
  const guard = requireRole(actor, ["TEAM_LEAD", "PM", "ADMIN"]); if (guard) return guard;

  if (action === "REJECT") {
    await prisma.stampRequest.update({
      where: { id },
      data: { status: "REJECTED", approvedAt: new Date(), comment: comment ?? null },
    });
    await notifyStampApplicantResult({
      emp: sr.employee,
      action: "REJECT",
      stampDate: sr.stampDate,
      reason: sr.description,
      comment,
    });
    return NextResponse.json({ ok: true });
  }

  // APPROVE: 스탬프 칸(쿠폰)을 현재 장에 추가
  await prisma.$transaction(async (tx) => {
    const { stampId } = await appendStampCouponToCard(tx, sr.employeeId, sr.stampDate);
    await tx.stampRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        approverId: user.employeeId,
        stampId,
        comment: comment ?? null,
      },
    });
  });

  await notifyStampApplicantResult({
    emp: sr.employee,
    action: "APPROVE",
    stampDate: sr.stampDate,
    reason: sr.description,
    comment,
  });

  return NextResponse.json({ ok: true });
}

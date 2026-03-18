import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  sendInviteAlimtalk,
  sendLeaveRequestAlimtalk,
  sendLeaveResultAlimtalk,
} from "@/lib/kakao";

/**
 * 테스트용 카카오 알림톡 발송 (관리자 전용)
 * body: { phone: string, template: "INVITE_REGISTER" | "LEAVE_REQUEST" | "LEAVE_RESULT" }
 */
export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM", "ADMIN"].includes(u?.role ?? ""))
    return NextResponse.json({ error: "관리자 전용" }, { status: 403 });

  const { phone, template } = await req.json().catch(() => ({}));
  // 테스트는 TEST_PHONE_OVERRIDE가 있으면 그 번호로 강제됨. (phone은 선택)
  const resolvedPhone = typeof phone === "string" && phone.trim() ? phone.trim() : "01000000000";

  const templateType = template ?? "LEAVE_REQUEST";
  const testId = "test-alimtalk";

  try {
    if (templateType === "INVITE_REGISTER") {
      await sendInviteAlimtalk(
        prisma,
        testId,
        resolvedPhone,
        "테스트이름",
        "https://example.com/register/test-token"
      );
    } else if (templateType === "LEAVE_REQUEST") {
      await sendLeaveRequestAlimtalk(
        prisma,
        testId,
        resolvedPhone,
        "결재자(테스트)",
        "신청자(테스트)",
        "연차",
        "2025-03-10",
        "2025-03-12"
      );
    } else if (templateType === "LEAVE_RESULT") {
      await sendLeaveResultAlimtalk(
        prisma,
        testId,
        resolvedPhone,
        "테스트이름",
        "승인",
        "테스트 발송입니다."
      );
    } else {
      return NextResponse.json({ error: "지원하지 않는 template" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "알림톡 발송 요청 완료 (실제 발송 여부는 환경 설정에 따름)" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "발송 실패" }, { status: 500 });
  }
}

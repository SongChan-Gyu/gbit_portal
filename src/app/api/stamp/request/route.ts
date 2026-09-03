import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { sendStampRequestAlimtalk } from "@/lib/kakao";
import { createNotification } from "@/lib/notification";

type Approver = {
  id: string;
  name: string;
  phone: string;
  alimtalkEnabled: boolean;
};

function stampYmdFromInput(stampDate: unknown): string {
  if (typeof stampDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(stampDate.slice(0, 10))) {
    return stampDate.slice(0, 10);
  }
  return "";
}

/** 팀장 서명 결재자: 본인이 아닌 팀장, 없으면 활성 PM (휴가 1단과 동일 폴백) */
async function resolveStampApprover(emp: {
  id: string;
  team?: { leader: Approver | null } | null;
}): Promise<Approver | null> {
  const teamLeader = emp.team?.leader ?? null;
  if (teamLeader && teamLeader.id !== emp.id) return teamLeader;

  const pm = await prisma.employee.findFirst({
    where: { role: "PM", status: "ACTIVE" },
    select: { id: true, name: true, phone: true, alimtalkEnabled: true },
  });
  if (pm && pm.id !== emp.id) return pm;
  return null;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { employeeId?: string };
  if (!user.employeeId) return NextResponse.json({ error: "사원 정보가 없습니다." }, { status: 400 });

  const { stampDate, description } = await req.json();

  if (!stampDate || !description?.trim())
    return NextResponse.json({ error: "날짜와 반영 내용을 입력하세요." }, { status: 400 });

  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: {
      team: {
        include: {
          leader: { select: { id: true, name: true, phone: true, alimtalkEnabled: true } },
        },
      },
    },
  });
  if (!emp) return NextResponse.json({ error: "직원 정보를 찾을 수 없습니다." }, { status: 404 });

  const approver = await resolveStampApprover(emp);
  const stampYmd = stampYmdFromInput(stampDate);
  const reason = String(description).trim();

  const sr = await prisma.stampRequest.create({
    data: {
      employeeId: user.employeeId,
      stampDate: new Date(stampDate),
      description: reason,
      approverId: approver?.id ?? null,
    },
  });

  if (approver) {
    try {
      await createNotification({
        employeeId: approver.id,
        type: "STAMP_REQUEST",
        body: `${emp.name}님이 스탬프 서명(팀장 서명)을 요청했습니다.${stampYmd ? ` (${stampYmd})` : ""}`,
        link: "/stamp/approve",
      });
    } catch (e) {
      console.warn("[stamp/request] 인앱 알림 생성 실패", e);
    }
  }

  let warning: string | undefined;
  if (!approver) {
    warning = "결재자(팀장 또는 PM)가 없어 알림톡을 발송하지 못했습니다.";
  } else if (!approver.phone) {
    warning = "결재자 연락처가 없어 카카오 알림톡을 발송하지 못했습니다.";
  } else if (approver.alimtalkEnabled === false) {
    warning = "결재자가 카카오 알림톡 미사용 상태라 알림톡을 발송하지 않았습니다.";
  } else {
    try {
      await sendStampRequestAlimtalk(
        prisma,
        approver.id,
        approver.phone,
        approver.name,
        emp.name,
        stampYmd,
        reason,
      );
    } catch (alimErr) {
      console.warn("[stamp/request] 알림톡 발송 실패 (스탬프 요청은 완료됨)", alimErr);
      warning = "카카오 알림톡 발송에 실패했습니다. (스탬프 요청은 정상 처리됨)";
    }
  }

  return NextResponse.json({ ok: true, id: sr.id, warning });
}

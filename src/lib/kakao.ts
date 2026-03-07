import type { PrismaClient } from "@prisma/client";

/** 카카오 알림톡 발송 (stub - API키 설정 후 실제 구현) */
async function sendAlimtalk(
  prisma: PrismaClient,
  targetId: string,
  phone: string,
  templateCode: string,
  params: Record<string, string>
) {
  const sentAt = new Date();

  // TODO: 실제 카카오 알림톡 API 호출
  // const KAKAO_API_KEY = process.env.KAKAO_API_KEY;
  // const KAKAO_SENDER_KEY = process.env.KAKAO_SENDER_KEY;
  // await fetch("https://kakaoapi.aligo.in/akv10/alimtalk/send/", { ... })

  const isMocked = !process.env.KAKAO_API_KEY || process.env.KAKAO_API_KEY === "your_kakao_api_key_here";
  const status = isMocked ? "MOCKED" : "SENT";

  await prisma.notificationLog.create({
    data: {
      targetId, phone, type: "ALIMTALK",
      templateCode, params: JSON.stringify(params),
      status, sentAt,
    },
  });
  if (isMocked) {
    console.log(`[AlimTalk Mock] to=${phone} template=${templateCode}`, params);
  }
}

export async function sendInviteAlimtalk(
  prisma: PrismaClient, employeeId: string, phone: string, name: string, url: string
) {
  await sendAlimtalk(prisma, employeeId, phone, "INVITE_REGISTER", { name, url });
}

export async function sendLeaveRequestAlimtalk(
  prisma: PrismaClient, approverId: string, phone: string,
  approverName: string, applicantName: string,
  leaveTypeName: string, startDate: string, endDate: string
) {
  await sendAlimtalk(prisma, approverId, phone, "LEAVE_REQUEST", {
    approverName, applicantName, leaveTypeName, startDate, endDate,
  });
}

export async function sendLeaveResultAlimtalk(
  prisma: PrismaClient, employeeId: string, phone: string,
  name: string, result: string, comment: string
) {
  await sendAlimtalk(prisma, employeeId, phone, "LEAVE_RESULT", { name, result, comment });
}

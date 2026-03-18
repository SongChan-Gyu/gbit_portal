import type { PrismaClient } from "@prisma/client";

/**
 * 카카오 알림톡 발송 (Aligo 연동)
 *
 * 필요 환경변수
 * - KAKAO_API_KEY: 알리고 API Key
 * - KAKAO_USER_ID: 알리고 userid
 * - KAKAO_TOKEN: 알리고 토큰(token/create로 발급)
 * - KAKAO_SENDER_KEY: 발신프로필키(senderkey) - 알리고 콘솔에서 발급
 * - KAKAO_SENDER: 발신자 연락처(알리고 등록된 발신번호)
 *
 * 테스트 안전장치
 * - ALIMTALK_ALLOWED_RECEIVER: 설정 시, 이 번호로만 알림톡 발송 허용 (그 외는 SKIPPED로 로깅)
 *   예: 01044234532
 */
async function sendAlimtalk(
  prisma: PrismaClient,
  targetId: string,
  phone: string,
  templateCode: string,
  params: Record<string, string>
) {
  const sentAt = new Date();

  const apikey = process.env.KAKAO_API_KEY?.trim();
  const userid = process.env.KAKAO_USER_ID?.trim();
  const token = process.env.KAKAO_TOKEN?.trim();
  const senderkey = process.env.KAKAO_SENDER_KEY?.trim();
  const sender = process.env.KAKAO_SENDER?.trim();
  const allowedReceiver = process.env.ALIMTALK_ALLOWED_RECEIVER?.trim();

  const normalizePhone = (s: string) => s.replace(/[^\d]/g, "");
  const receiver = normalizePhone(phone || "");
  const allowed = allowedReceiver ? normalizePhone(allowedReceiver) : "";

  const isMocked = !apikey || !userid || !token || !senderkey || !sender;
  let status = isMocked ? "MOCKED" : "SENT";
  let errorMsg: string | null = null;

  // 템플릿 본문: 알리고에 등록한 내용과 동일하게 맞춰야 검수/발송이 안정적
  const templates: Record<string, { subject: string; body: string }> = {
    // 휴가
    LEAVE_REQUEST: {
      subject: "휴가 결재 요청",
      body:
`[GBIT Portal]
#{결재자명}님, 휴가 결재 요청이 도착했습니다.

- 신청자: #{신청자명}
- 휴가유형: #{휴가유형}
- 기간: #{시작일}(#{시작요일}) ~ #{종료일}(#{종료요일})

GBIT Portal에서 확인 후 처리 부탁드립니다.
본 메시지는 발신 전용입니다.`,
    },
    LEAVE_RESULT: {
      subject: "휴가 처리 결과",
      body:
`[GBIT Portal]
#{신청자명}님, 신청하신 휴가가 #{처리결과}(으)로 처리되었습니다.

#{처리코멘트}

GBIT Portal에서 상세 내역을 확인해 주세요.
본 메시지는 발신 전용입니다.`,
    },
    // 제주 숙소
    JEJU_REQUEST: {
      subject: "제주 숙소 예약 결재 요청",
      body:
`[GBIT Portal]
#{결재자명}님, 제주도 숙소 예약 결재 요청이 도착했습니다.

- 신청자: #{신청자명}
- 이용기간: #{입실일}(#{입실요일}) ~ #{퇴실일}(#{퇴실요일})
- 숙박: #{숙박일수}박
- 입실인원: #{입실인원}명

GBIT Portal에서 확인 후 처리 부탁드립니다.
본 메시지는 발신 전용입니다.`,
    },
    JEJU_APPROVED: {
      subject: "제주 숙소 예약 승인",
      body:
`[GBIT Portal]
#{신청자명}님, 제주도 숙소 예약 신청이 승인되었습니다.

- 이용기간: #{입실일}(#{입실요일}) ~ #{퇴실일}(#{퇴실요일})
- 숙박: #{숙박일수}박
- 입실인원: #{입실인원}명

예약금 안내 등 상세내용은 GBIT Portal에서 확인해 주세요.
본 메시지는 발신 전용입니다.`,
    },
    JEJU_REJECTED: {
      subject: "제주 숙소 예약 반려",
      body:
`[GBIT Portal]
#{신청자명}님, 제주도 숙소 예약 신청이 반려되었습니다.

- 이용기간: #{입실일}(#{입실요일}) ~ #{퇴실일}(#{퇴실요일})
- 사유: #{반려사유}

GBIT Portal에서 상세내역을 확인해 주세요.
본 메시지는 발신 전용입니다.`,
    },
    JEJU_CANCEL_REQUESTED: {
      subject: "제주 숙소 예약 취소 요청",
      body:
`[GBIT Portal]
#{결재자명}님, 제주도 숙소 예약 취소 요청이 도착했습니다.

- 신청자: #{신청자명}
- 이용기간: #{입실일}(#{입실요일}) ~ #{퇴실일}(#{퇴실요일})
- 사유: #{취소사유}

GBIT Portal에서 확인 후 처리 부탁드립니다.
본 메시지는 발신 전용입니다.`,
    },
    JEJU_CANCELLED: {
      subject: "제주 숙소 예약 취소 처리",
      body:
`[GBIT Portal]
#{신청자명}님, 제주도 숙소 예약 취소가 처리되었습니다.

- 이용기간: #{입실일}(#{입실요일}) ~ #{퇴실일}(#{퇴실요일})

GBIT Portal에서 상세내역을 확인해 주세요.
본 메시지는 발신 전용입니다.`,
    },
  };

  const tpl = templates[templateCode];
  const subject = tpl?.subject || templateCode;
  let message = tpl?.body || `[GBIT Portal]\n알림이 도착했습니다.\n\n템플릿: ${templateCode}`;

  // #{변수명} 치환
  for (const [k, v] of Object.entries(params)) {
    message = message.split(`#{${k}}`).join(String(v ?? ""));
  }

  if (!receiver) {
    status = "FAILED";
    errorMsg = "수신 번호가 비어 있습니다.";
  } else if (!isMocked && allowed && receiver !== allowed) {
    status = "SKIPPED";
    errorMsg = `테스트 안전장치로 발송 스킵 (허용 수신번호: ${allowedReceiver})`;
  }

  if (!isMocked && receiver && status === "SENT") {
    try {
      const form = new FormData();
      form.set("apikey", apikey!);
      form.set("userid", userid!);
      form.set("token", token!);
      form.set("senderkey", senderkey!);
      form.set("tpl_code", templateCode); // 알리고에 등록한 템플릿 코드와 동일해야 함
      form.set("sender", sender!);
      form.set("receiver_1", receiver);
      form.set("subject_1", subject);
      form.set("message_1", message);
      form.set("recvname", params["신청자명"] || params["결재자명"] || params["수신자명"] || "GBIT");
      form.set("failover", "N");

      const res = await fetch("https://kakaoapi.aligo.in/akv10/alimtalk/send/", {
        method: "POST",
        body: form as any,
      });
      const data = await res.json().catch(() => ({}));

      // 알리고 응답: result_code가 1이면 성공(관례)
      const ok = String((data as any).result_code ?? "") === "1";
      if (!ok) {
        status = "FAILED";
        errorMsg = (data as any).message || (data as any).result_message || JSON.stringify(data);
      }
    } catch (e: any) {
      status = "FAILED";
      errorMsg = e?.message ?? "알림톡 발송 실패";
    }
  } else if (isMocked) {
    console.log(`[AlimTalk Mock] to=${receiver} template=${templateCode}`, params);
  }

  await prisma.notificationLog.create({
    data: {
      targetId, phone: receiver || phone, type: "ALIMTALK",
      templateCode, params: JSON.stringify(params),
      status, sentAt,
      errorMsg,
    },
  });
}

export async function sendInviteAlimtalk(
  prisma: PrismaClient, employeeId: string, phone: string, name: string, url: string
) {
  // 현재 회원가입 초대는 이메일로만 운영(알림톡 템플릿 미사용) — 필요 시 다시 연결
  await sendAlimtalk(prisma, employeeId, phone, "INVITE_REGISTER", { 수신자명: name, 가입링크: url });
}

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
function dowLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return DOW_KO[dt.getDay()] ?? "";
}

export async function sendLeaveRequestAlimtalk(
  prisma: PrismaClient, approverId: string, phone: string,
  approverName: string, applicantName: string,
  leaveTypeName: string, startDate: string, endDate: string
) {
  await sendAlimtalk(prisma, approverId, phone, "LEAVE_REQUEST", {
    결재자명: approverName,
    신청자명: applicantName,
    휴가유형: leaveTypeName,
    시작일: startDate,
    시작요일: dowLabel(startDate),
    종료일: endDate,
    종료요일: dowLabel(endDate),
  });
}

export async function sendLeaveResultAlimtalk(
  prisma: PrismaClient, employeeId: string, phone: string,
  name: string, result: string, comment: string
) {
  await sendAlimtalk(prisma, employeeId, phone, "LEAVE_RESULT", {
    신청자명: name,
    처리결과: result,
    처리코멘트: comment || "-",
  });
}

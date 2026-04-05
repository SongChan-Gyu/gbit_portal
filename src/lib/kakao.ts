import type { DB } from "@/lib/db";
import { dowLabelKoFromYmd } from "@/lib/dateUtils";
import { directsendKakaoAlimtalk } from "@/lib/directsendKakao";

/**
 * 카카오 알림톡 — 다이렉트센드(DirectSend) `api_v2/kakao_notice` 연동
 *
 * 환경변수
 * - DIRECTSEND_USERNAME: 다이렉트센드 ID
 * - DIRECTSEND_API_KEY: 다이렉트센드 API key (문자/메일용)
 * - DIRECTSEND_KAKAO_PLUS_ID: 발신프로필 @검색용아이디
 * - DIRECTSEND_ALIMTALK_TEMPLATE_NOS: JSON. 포털 내부 템플릿 코드 → 다이렉트센드 user_template_no
 *   예: {"LEAVE_REQUEST":"12345","LEAVE_RESULT":"12346", ...}
 *   코드별 note1~note5 매핑은 docs/alimtalk-templates.md 참고 (카카오 템플릿 변수와 맞출 것)
 *
 * 선택
 * - ALIMTALK_ALLOWED_RECEIVER: 설정 시 해당 번호로만 발송, 그 외 SKIPPED
 *
 * 위 설정이 없거나 해당 템플릿 번호가 JSON에 없으면 MOCKED(미발송), NotificationLog 기록.
 */

function loadDirectsendTemplateNos(): Record<string, string> {
  const raw = process.env.DIRECTSEND_ALIMTALK_TEMPLATE_NOS?.trim();
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (v != null && String(v).trim() !== "") out[k] = String(v).trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** 다이렉트센드 API는 수신자당 note1~note5만 치환 가능 — 포털 템플릿 코드별 매핑 */
function directsendNotesForPortalTemplate(
  templateCode: string,
  params: Record<string, string>,
): [string, string, string, string, string] {
  const g = (k: string) => (params[k] ?? "").trim();
  const periodJeju = () =>
    `${g("입실일")}(${g("입실요일")}) ~ ${g("퇴실일")}(${g("퇴실요일")})`;

  switch (templateCode) {
    case "LEAVE_REQUEST":
      return [
        g("결재자명"),
        g("신청자명"),
        g("휴가유형"),
        `${g("시작일")}(${g("시작요일")}) ~ ${g("종료일")}(${g("종료요일")})`,
        "",
      ];
    case "LEAVE_WITHDRAWN":
      return [g("결재자명"), g("신청자명"), g("요약"), "", ""];
    case "LEAVE_RESULT":
      return [g("신청자명"), g("처리결과"), g("처리코멘트"), "", ""];
    case "JEJU_APPROVED":
      return [g("신청자명"), periodJeju(), `${g("숙박일수")}박`, `${g("입실인원")}명`, ""];
    case "JEJU_REJECTED":
      return [g("신청자명"), periodJeju(), g("반려사유"), "", ""];
    case "JEJU_CANCELLED":
      return [g("신청자명"), periodJeju(), "", "", ""];
    case "JEJU_APPLICANT_STEP1_OK":
      return [g("신청자명"), g("투숙객명"), periodJeju(), "", ""];
    /** 복지 1차 · PM 입금확인 공통 템플릿 — note4 처리단계로 구분 */
    case "JEJU_STAFF":
      return [g("신청자명"), g("이용기간"), g("입금자명"), g("처리단계"), ""];
    /** 취소 1차 · PM 입금취소 공통 — note3 입금자명은 취소 1차일 때 빈 값 */
    case "JEJU_STAFF_CANCEL":
      return [g("신청자명"), g("이용기간"), g("입금자명"), g("처리단계"), ""];
    default:
      return ["", "", "", "", ""];
  }
}

function receiverDisplayName(params: Record<string, string>): string {
  return (
    params["결재자명"]?.trim() ||
    params["신청자명"]?.trim() ||
    params["수신자명"]?.trim() ||
    "GBIT"
  );
}

async function sendAlimtalk(
  prisma: DB,
  targetId: string,
  phone: string,
  templateCode: string,
  params: Record<string, string>,
) {
  const sentAt = new Date();
  const normalizePhone = (s: string) => s.replace(/[^\d]/g, "");
  const receiver = normalizePhone(phone || "");
  const allowedReceiver = process.env.ALIMTALK_ALLOWED_RECEIVER?.trim();
  const allowed = allowedReceiver ? normalizePhone(allowedReceiver) : "";

  const username = process.env.DIRECTSEND_USERNAME?.trim();
  const apiKey = process.env.DIRECTSEND_API_KEY?.trim();
  const plusId = process.env.DIRECTSEND_KAKAO_PLUS_ID?.trim();
  const templateNos = loadDirectsendTemplateNos();
  const userTemplateNo = templateNos[templateCode] ?? "";

  const credsOk = Boolean(username && apiKey && plusId && userTemplateNo);
  let status: string = credsOk ? "SENT" : "MOCKED";
  let errorMsg: string | null = null;

  if (!receiver) {
    status = "FAILED";
    errorMsg = "수신 번호가 비어 있습니다.";
  } else if (credsOk && allowed && receiver !== allowed) {
    status = "SKIPPED";
    errorMsg = `테스트 안전장치로 발송 스킵 (허용 수신번호: ${allowedReceiver})`;
  } else if (!credsOk) {
    if (!username || !apiKey || !plusId) {
      errorMsg = "다이렉트센드 DIRECTSEND_USERNAME / DIRECTSEND_API_KEY / DIRECTSEND_KAKAO_PLUS_ID 미설정";
    } else if (!userTemplateNo) {
      errorMsg = `DIRECTSEND_ALIMTALK_TEMPLATE_NOS 에 "${templateCode}" 번호 없음`;
    }
    if (process.env.NODE_ENV !== "production") {
      console.log(`[AlimTalk Mock] to=${receiver} template=${templateCode}`, params);
    }
  }

  if (status === "SENT" && receiver) {
    const [n1, n2, n3, n4, n5] = directsendNotesForPortalTemplate(templateCode, params);
    try {
      const result = await directsendKakaoAlimtalk({
        credentials: { username: username!, key: apiKey! },
        kakaoPlusId: plusId!,
        userTemplateNo,
        receiver: [
          {
            name: receiverDisplayName(params),
            mobile: receiver,
            note1: n1,
            note2: n2,
            note3: n3,
            note4: n4,
            note5: n5,
          },
        ],
      });
      if (!result.ok) {
        status = "FAILED";
        const j = result.json as { status?: number; message?: string } | null;
        errorMsg =
          j?.message ||
          (typeof result.raw === "string" ? result.raw.slice(0, 500) : "알림톡 발송 실패");
      }
    } catch (e: unknown) {
      status = "FAILED";
      errorMsg = e instanceof Error ? e.message : "알림톡 발송 실패";
    }
  }

  await prisma.notificationLog.create({
    data: {
      targetId,
      phone: receiver || phone,
      type: "ALIMTALK",
      templateCode,
      params: JSON.stringify(params),
      status,
      sentAt,
      errorMsg,
    },
  });
}

export async function sendLeaveRequestAlimtalk(
  prisma: DB,
  approverId: string,
  phone: string,
  approverName: string,
  applicantName: string,
  leaveTypeName: string,
  startDate: string,
  endDate: string,
) {
  await sendAlimtalk(prisma, approverId, phone, "LEAVE_REQUEST", {
    결재자명: approverName,
    신청자명: applicantName,
    휴가유형: leaveTypeName,
    시작일: startDate,
    시작요일: dowLabelKoFromYmd(startDate),
    종료일: endDate,
    종료요일: dowLabelKoFromYmd(endDate),
  });
}

export async function sendLeaveWithdrawAlimtalk(
  prisma: DB,
  approverId: string,
  phone: string,
  approverName: string,
  applicantName: string,
  summary: string,
) {
  await sendAlimtalk(prisma, approverId, phone, "LEAVE_WITHDRAWN", {
    결재자명: approverName,
    신청자명: applicantName,
    요약: summary,
  });
}

export async function sendLeaveResultAlimtalk(
  prisma: DB,
  employeeId: string,
  phone: string,
  name: string,
  result: string,
  comment: string,
) {
  await sendAlimtalk(prisma, employeeId, phone, "LEAVE_RESULT", {
    신청자명: name,
    처리결과: result,
    처리코멘트: comment || "-",
  });
}

export async function sendJejuStaffAlimtalk(
  prisma: DB,
  phone: string,
  templateCode: string,
  params: Record<string, string>,
) {
  await sendAlimtalk(prisma, "jeju-staff-notify", phone, templateCode, params);
}

export async function sendJejuApplicantAlimtalk(
  prisma: DB,
  employeeId: string,
  phone: string,
  templateCode: string,
  params: Record<string, string>,
) {
  await sendAlimtalk(prisma, employeeId, phone, templateCode, params);
}

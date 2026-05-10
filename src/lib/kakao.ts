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
 *   한 줄이어도 되고, 붙여넣기로 줄바꿈·공백이 섞여 있어도 파싱 전에 공백을 제거해 처리함.
 *   (.env 파일에서는 `KEY=` 다음 줄에 `{`만 두면 안 되고, 한 줄로 쓰거나 작은따옴표로 값 전체를 감쌀 것)
 *   코드별 note1~note5 매핑은 docs/alimtalk-templates.md 참고 (카카오 템플릿 변수와 맞출 것).
 *
 * - ALIMTALK_NOTE_LAYOUT: `v1`(기본) | `v2`. 카카오 템플릿 검수 전에는 v1 유지.
 *   v1 = 기존 승인 본문(비고5 비사용·제주 담당자 템플릿 note1=투숙 표기명 등).
 *   v2 = 신규 본문(비고5 포털 URL·제주 직원/투숙/연도 누적 등). 새 템플릿 승인 후 v2로 전환.
 *
 * 선택
 * - ALIMTALK_ALLOWED_RECEIVER: 설정 시 나열된 번호로만 발송, 그 외 SKIPPED.
 *   쉼표·공백·세미콜론으로 여러 개 (예: 01011112222,01033334444)
 *
 * 위 설정이 없거나 해당 템플릿 번호가 JSON에 없으면 MOCKED(미발송), NotificationLog 기록.
 */

/** ALIMTALK_ALLOWED_RECEIVER — 숫자만 비교. 구분자: 쉼표·공백·세미콜론 */
function allowedAlimtalkReceiverSet(): Set<string> {
  const raw = process.env.ALIMTALK_ALLOWED_RECEIVER?.trim();
  if (!raw) return new Set();
  const set = new Set<string>();
  for (const part of raw.split(/[,;\s]+/).filter(Boolean)) {
    const d = part.replace(/[^\d]/g, "");
    if (d) set.add(d);
  }
  return set;
}

function loadDirectsendTemplateNos(): Record<string, string> {
  let raw = process.env.DIRECTSEND_ALIMTALK_TEMPLATE_NOS?.trim();
  if (!raw) return {};
  // 포맷된 JSON 붙여넣기(줄바꿈·들여쓰기)도 동작하도록 공백 제거 후 파싱
  raw = raw.replace(/\s+/g, "");
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

/** 알림톡 본문 하단 포털 링크 — NEXTAUTH_URL → NEXT_PUBLIC_APP_URL → 운영 기본값 */
function portalOriginForAlimtalkLink(): string {
  const auth = process.env.NEXTAUTH_URL?.trim();
  if (auth?.startsWith("http")) return auth.replace(/\/$/, "");
  const pub = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (pub?.startsWith("http")) return pub.replace(/\/$/, "");
  return "https://www.gbitportal.co.kr";
}

function alimtalkPortalPathUrl(path: string): string {
  const origin = portalOriginForAlimtalkLink();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${p}`;
}

/**
 * 알림톡 note 매핑 버전. 기본 v1 = 기존 카카오 승인 템플릿과 동일 배치.
 * v2 = docs/alimtalk-templates.md 최신(비고5 URL·제주 확장 필드).
 */
export function alimtalkNoteLayoutVersion(): "v1" | "v2" {
  const v = process.env.ALIMTALK_NOTE_LAYOUT?.trim().toLowerCase();
  return v === "v2" ? "v2" : "v1";
}

/** 기존(승인된) 카카오 템플릿과 동일 — 비고5 미사용, 제주 담당 note1=신청자명(실제 투숙 표기명) */
function directsendNotesForPortalTemplateV1(
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
    case "JEJU_STAFF":
      return [g("신청자명"), g("이용기간"), g("입금자명"), g("처리단계"), ""];
    case "JEJU_STAFF_CANCEL":
      return [g("신청자명"), g("이용기간"), g("입금자명"), g("처리단계"), ""];
    case "EXTERNAL_INVITE":
      return [g("이름"), g("가입링크"), g("만료일"), "", ""];
    case "FORM_REMINDER":
      return [g("이름"), g("양식명"), g("링크"), "", ""];
    case "JEJU_DEPOSIT_REMINDER":
      return [g("이름"), g("이용기간"), g("입금안내"), "", ""];
    default:
      return ["", "", "", "", ""];
  }
}

function directsendNotesForPortalTemplateV2(
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
        alimtalkPortalPathUrl("/leave/approve"),
      ];
    case "LEAVE_WITHDRAWN":
      return [g("결재자명"), g("신청자명"), g("요약"), "", alimtalkPortalPathUrl("/leave/approve")];
    case "LEAVE_RESULT":
      return [g("신청자명"), g("처리결과"), g("처리코멘트"), "", alimtalkPortalPathUrl("/leave/my")];
    case "JEJU_APPROVED":
      return [
        g("신청자명"),
        g("투숙객명"),
        periodJeju(),
        `${g("숙박일수")}박 · 입실 ${g("입실인원")}명 · ${g("연도누적신청")}`,
        alimtalkPortalPathUrl("/jeju/my"),
      ];
    case "JEJU_REJECTED":
      return [
        g("신청자명"),
        g("투숙객명"),
        periodJeju(),
        `${g("반려사유")} · ${g("연도누적신청")}`,
        alimtalkPortalPathUrl("/jeju/my"),
      ];
    case "JEJU_CANCELLED":
      return [
        g("신청자명"),
        g("투숙객명"),
        periodJeju(),
        g("연도누적신청"),
        alimtalkPortalPathUrl("/jeju/my"),
      ];
    case "JEJU_APPLICANT_STEP1_OK":
      return [
        g("신청자명"),
        g("투숙객명"),
        periodJeju(),
        g("연도누적신청"),
        alimtalkPortalPathUrl("/jeju/my"),
      ];
    case "JEJU_STAFF":
      // note4=입금자명만, note5=처리·연도·URL 각 한 줄(\n). API는 비고 5개까지라 한 필드에 개행으로 묶음.
      return [
        g("직원신청자명"),
        g("투숙객명"),
        g("이용기간"),
        g("입금자명"),
        `${g("처리단계")}\n${g("연도누적신청")}\n${alimtalkPortalPathUrl("/jeju/approve")}`,
      ];
    case "JEJU_STAFF_CANCEL":
      return [
        g("직원신청자명"),
        g("투숙객명"),
        g("이용기간"),
        g("입금자명"),
        `${g("처리단계")}\n${g("연도누적신청")}\n${alimtalkPortalPathUrl("/jeju/approve")}`,
      ];
    case "EXTERNAL_INVITE":
      return [g("이름"), g("가입링크"), g("만료일"), "", ""];
    case "FORM_REMINDER":
      return [g("이름"), g("양식명"), g("링크"), "", alimtalkPortalPathUrl(g("링크경로") || "/dashboard")];
    case "JEJU_DEPOSIT_REMINDER":
      return [g("이름"), g("이용기간"), g("입금안내"), "", alimtalkPortalPathUrl("/jeju/my")];
    default:
      return ["", "", "", "", ""];
  }
}

/** 다이렉트센드 API는 수신자당 note1~note5만 치환 가능 — 포털 템플릿 코드별 매핑 */
function directsendNotesForPortalTemplate(
  templateCode: string,
  params: Record<string, string>,
): [string, string, string, string, string] {
  return alimtalkNoteLayoutVersion() === "v2"
    ? directsendNotesForPortalTemplateV2(templateCode, params)
    : directsendNotesForPortalTemplateV1(templateCode, params);
}

function receiverDisplayName(params: Record<string, string>): string {
  return (
    params["직원신청자명"]?.trim() ||
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
  const allowedReceivers = allowedAlimtalkReceiverSet();
  const allowedListLabel = process.env.ALIMTALK_ALLOWED_RECEIVER?.trim() ?? "";

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
  } else if (credsOk && allowedReceivers.size > 0 && !allowedReceivers.has(receiver)) {
    status = "SKIPPED";
    errorMsg = `테스트 안전장치로 발송 스킵 (허용 수신번호: ${allowedListLabel})`;
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

/**
 * 유동양식 제출 요청 알림톡 (FORM_REMINDER)
 * note1=이름, note2=양식명, note3=링크, note5(v2)=포털URL
 */
export async function sendFormReminderAlimtalk(
  prisma: DB,
  employeeId: string,
  phone: string,
  name: string,
  formTitle: string,
  formUrl: string,
) {
  await sendAlimtalk(prisma, employeeId, phone, "FORM_REMINDER", {
    수신자명: name,
    이름: name,
    양식명: formTitle,
    링크: formUrl,
    링크경로: formUrl,
  });
}

/**
 * 제주도 입금 안내 알림톡 (JEJU_DEPOSIT_REMINDER)
 * note1=이름, note2=이용기간, note3=입금안내(계좌+금액 포함 문자열)
 */
export async function sendJejuDepositReminderAlimtalk(
  prisma: DB,
  employeeId: string,
  phone: string,
  name: string,
  period: string,
  depositInfo: string,
) {
  await sendAlimtalk(prisma, employeeId, phone, "JEJU_DEPOSIT_REMINDER", {
    수신자명: name,
    이름: name,
    이용기간: period,
    입금안내: depositInfo,
  });
}

/**
 * 외부개발자 가입 초대 알림톡 (EXTERNAL_INVITE)
 * note1=이름, note2=가입링크, note3=만료일(7일 후)
 */
export async function sendExternalInviteAlimtalk(
  prisma: DB,
  employeeId: string,
  phone: string,
  name: string,
  registerUrl: string,
  expiresAt: Date,
) {
  const expiryLabel = expiresAt.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  await sendAlimtalk(prisma, employeeId, phone, "EXTERNAL_INVITE", {
    수신자명: name,
    이름: name,
    가입링크: registerUrl,
    만료일: expiryLabel,
  });
}

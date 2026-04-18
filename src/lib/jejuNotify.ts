/**
 * 제주 숙소 알림 헬퍼
 *
 * SystemConfig.jejuApprovalNotify 에 다음 구조로 저장:
 * {
 *   "step1": {
 *     "phone": "010...", "phone2": "010...", "email": "welfare@...", "notifyVia": "email" | "alimtalk" | "both"
 *   },
 *   "step2": { "phone": "010...", "email": "pm@...", "notifyVia": "email" }
 * }
 * step1.phone2: 복지부 단계 알림톡 추가 수신(선택). 번호가 동일하면 한 번만 발송.
 * notifyVia 생략 시 "email" (기존 설정 호환).
 *
 * sendJejuNotification(type, employee, row, step) 로 호출.
 *
 * 클라우드에서 SMTP/알림톡이 일부만 설정돼 있어도 본 함수는 가능한 채널만 시도하고,
 * 실패는 로그만 남깁니다(호출부 .catch와 함께 이중 방어). 본문 트랜잭션과 분리해 동작합니다.
 */

import { sendMail } from "@/lib/email";
import type { DB } from "@/lib/db";
import { kstYmd, dowLabelKoFromYmd, todayKstYmd } from "@/lib/dateUtils";
import { getJejuCalendarYearStats } from "@/lib/jejuYearStats";
import {
  alimtalkNoteLayoutVersion,
  sendJejuApplicantAlimtalk,
  sendJejuStaffAlimtalk,
} from "@/lib/kakao";

type NotifyType =
  | "step1_notify"
  | "step2_notify"
  | "applicant_step1_approved"
  | "applicant_approved"
  | "applicant_rejected"
  | "applicant_cancelled"
  | "cancel_step1_notify"
  | "cancel_step2_notify";

type NotifyVia = "email" | "alimtalk" | "both";

export interface NotifyEmployee {
  id: string;
  name: string;
  phone?: string | null;
  alimtalkEnabled?: boolean | null;
}

export interface NotifyRow {
  id: string;
  /** 신청 직원(휴가·제주 동일) — 담당자 알림·연도 집계에 사용 */
  employeeId: string;
  startDate: Date;
  endDate: Date;
  nights: number;
  guestName: string;
  guestCount: number;
  depositorName: string;
  rejectComment?: string | null;
}

type StepContact = { phone?: string; phone2?: string; email?: string; notifyVia?: NotifyVia };

function phoneDigits(p: string | undefined): string {
  return (p ?? "").replace(/\D/g, "");
}

/** 복지부(step1) 알림톡: 1차·추가 번호 각각 발송(숫자 동일 시 중복 생략) */
async function sendStep1StaffAlimtalkToPhones(
  prisma: DB,
  stepCfg: StepContact | undefined,
  templateCode: string,
  params: Record<string, string>,
  labelBase: string,
) {
  const ch = channels(stepCfg);
  if (!ch.alimtalk) return;
  const primary = stepCfg?.phone?.trim();
  const secondary = stepCfg?.phone2?.trim();
  const sentDigits = new Set<string>();
  if (primary) {
    const d = phoneDigits(primary);
    if (d) {
      sentDigits.add(d);
      await tryJejuStaffAlimtalk(prisma, `${labelBase}_1`, primary, templateCode, params);
    }
  }
  if (secondary) {
    const d = phoneDigits(secondary);
    if (d && !sentDigits.has(d)) {
      await tryJejuStaffAlimtalk(prisma, `${labelBase}_2`, secondary, templateCode, params);
    }
  }
}

function normalizeVia(v: unknown): NotifyVia {
  if (v === "alimtalk" || v === "both" || v === "email") return v;
  return "email";
}

async function getNotifyConfig(prisma: DB): Promise<{ step1?: StepContact; step2?: StepContact }> {
  try {
    const cfg = await (prisma as any).systemConfig.findUnique({ where: { key: "jejuApprovalNotify" } });
    if (cfg?.value) {
      const parsed = JSON.parse(cfg.value);
      return {
        step1: parsed?.step1
          ? { ...parsed.step1, notifyVia: normalizeVia(parsed.step1.notifyVia) }
          : undefined,
        step2: parsed?.step2
          ? { ...parsed.step2, notifyVia: normalizeVia(parsed.step2.notifyVia) }
          : undefined,
      };
    }
  } catch {
    // ignore
  }
  return {};
}

function channels(cfg: StepContact | undefined): { email: boolean; alimtalk: boolean } {
  const v = cfg?.notifyVia ?? "email";
  if (v === "both") return { email: true, alimtalk: true };
  if (v === "alimtalk") return { email: false, alimtalk: true };
  return { email: true, alimtalk: false };
}

function dateLabel(row: NotifyRow): string {
  const s = kstYmd(row.startDate);
  const e = kstYmd(row.endDate);
  return `${s} ~ ${e} (${row.nights}박)`;
}

async function applicantEmployeeName(prisma: DB, employeeId: string): Promise<string> {
  const e = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { name: true },
  });
  return e?.name?.trim() || "";
}

/** 달력 연도(KST 오늘 연도) 기준 제주 신청 건수 — 포털 `제주 신청현황`과 동일 규칙 */
async function jejuYearSubmittedSummaryKo(prisma: DB, employeeId: string): Promise<string> {
  const y = parseInt(todayKstYmd().slice(0, 4), 10);
  const st = await getJejuCalendarYearStats(prisma, employeeId, y);
  return `${y}년 누적 신청 ${st.submittedCount}건`;
}

async function staffJejuAlimtalkParams(
  prisma: DB,
  row: NotifyRow,
  입금자명: string,
  처리단계: string,
): Promise<Record<string, string>> {
  const 직원신청자명 = await applicantEmployeeName(prisma, row.employeeId);
  const 연도누적신청 = await jejuYearSubmittedSummaryKo(prisma, row.employeeId);
  return {
    직원신청자명: 직원신청자명 || "-",
    투숙객명: row.guestName,
    이용기간: dateLabel(row),
    입금자명,
    처리단계,
    연도누적신청,
  };
}

/** v1 카카오 템플릿: note1 `신청자명` = 투숙 표기명(guestName) — 과거 스펙 유지 */
function legacyJejuStaffAlimParams(
  row: NotifyRow,
  period: string,
  입금자명: string,
  처리단계: string,
): Record<string, string> {
  return {
    신청자명: row.guestName,
    이용기간: period,
    입금자명,
    처리단계,
  };
}

function applicantDateParams(row: NotifyRow): Record<string, string> {
  const s = kstYmd(row.startDate);
  const e = kstYmd(row.endDate);
  return {
    입실일: s,
    입실요일: dowLabelKoFromYmd(s),
    퇴실일: e,
    퇴실요일: dowLabelKoFromYmd(e),
    숙박일수: String(row.nights),
    입실인원: String(row.guestCount),
  };
}

async function tryJejuMail(label: string, send: () => Promise<void>) {
  try {
    await send();
  } catch (e) {
    console.warn(`[jejuNotify] 이메일 실패 (${label}):`, e);
  }
}

async function tryJejuStaffAlimtalk(
  prisma: DB,
  label: string,
  phone: string,
  templateCode: string,
  params: Record<string, string>,
) {
  try {
    await sendJejuStaffAlimtalk(prisma, phone, templateCode, params);
  } catch (e) {
    console.warn(`[jejuNotify] 담당자 알림톡 실패 (${label}):`, e);
  }
}

async function maybeApplicantAlimtalk(
  prisma: DB,
  employee: NotifyEmployee,
  templateCode: string,
  params: Record<string, string>,
) {
  if (!employee.phone || employee.alimtalkEnabled === false) return;
  try {
    await sendJejuApplicantAlimtalk(prisma, employee.id, employee.phone, templateCode, params);
  } catch (e) {
    console.warn(`[jejuNotify] 신청자 알림톡 실패 (${templateCode}):`, e);
  }
}

export async function sendJejuNotification(
  prisma: DB,
  type: NotifyType,
  employee: NotifyEmployee | null,
  row: NotifyRow,
  step: number,
): Promise<void> {
  const config = await getNotifyConfig(prisma);
  const stepCfg = step === 1 ? config.step1 : config.step2;
  const period = dateLabel(row);
  const ch = channels(stepCfg);
  const noteV2 = alimtalkNoteLayoutVersion() === "v2";

  switch (type) {
    case "step1_notify": {
      const 직원명 = await applicantEmployeeName(prisma, row.employeeId);
      if (ch.email && stepCfg?.email) {
        await tryJejuMail("step1_notify", () =>
          sendMail({
            to: stepCfg.email!,
            subject: `[제주숙소] 복지부 승인 요청 - ${row.guestName} (${period})`,
            text: `제주 숙소 신청이 접수되어 복지부 승인이 필요합니다.\n직원 신청자: ${직원명 || "-"}\n투숙(표기명): ${row.guestName}\n기간: ${period}\n입금자명: ${row.depositorName}`,
          }),
        );
      }
      const staffParams = noteV2
        ? await staffJejuAlimtalkParams(prisma, row, row.depositorName ?? "-", "복지부 승인 필요")
        : legacyJejuStaffAlimParams(row, period, row.depositorName ?? "-", "복지부 승인 필요");
      await sendStep1StaffAlimtalkToPhones(prisma, stepCfg, "JEJU_STAFF", staffParams, "step1_notify");
      break;
    }
    case "step2_notify": {
      const 직원명2 = await applicantEmployeeName(prisma, row.employeeId);
      if (ch.email && stepCfg?.email) {
        await tryJejuMail("step2_notify", () =>
          sendMail({
            to: stepCfg.email!,
            subject: `[제주숙소] 입금확인 요청 - ${row.guestName} (${period})`,
            text: `복지부 승인이 완료되어 입금확인이 필요합니다.\n직원 신청자: ${직원명2 || "-"}\n투숙(표기명): ${row.guestName}\n기간: ${period}\n입금자명: ${row.depositorName}`,
          }),
        );
      }
      if (ch.alimtalk && stepCfg?.phone) {
        const p = noteV2
          ? await staffJejuAlimtalkParams(prisma, row, row.depositorName ?? "-", "입금 확인 필요")
          : legacyJejuStaffAlimParams(row, period, row.depositorName ?? "-", "입금 확인 필요");
        await tryJejuStaffAlimtalk(prisma, "step2_notify", stepCfg.phone, "JEJU_STAFF", p);
      }
      break;
    }
    case "applicant_step1_approved": {
      if (!employee) break;
      if (noteV2) {
        const 연도누적신청 = await jejuYearSubmittedSummaryKo(prisma, employee.id);
        await maybeApplicantAlimtalk(prisma, employee, "JEJU_APPLICANT_STEP1_OK", {
          신청자명: employee.name,
          투숙객명: row.guestName,
          ...applicantDateParams(row),
          연도누적신청,
        });
      } else {
        await maybeApplicantAlimtalk(prisma, employee, "JEJU_APPLICANT_STEP1_OK", {
          신청자명: employee.name,
          투숙객명: row.guestName,
          ...applicantDateParams(row),
        });
      }
      break;
    }
    case "applicant_approved": {
      if (!employee) break;
      if (noteV2) {
        const 연도누적신청 = await jejuYearSubmittedSummaryKo(prisma, employee.id);
        await maybeApplicantAlimtalk(prisma, employee, "JEJU_APPROVED", {
          신청자명: employee.name,
          투숙객명: row.guestName,
          ...applicantDateParams(row),
          연도누적신청,
        });
      } else {
        await maybeApplicantAlimtalk(prisma, employee, "JEJU_APPROVED", {
          신청자명: employee.name,
          ...applicantDateParams(row),
        });
      }
      break;
    }
    case "applicant_rejected": {
      if (!employee) break;
      if (noteV2) {
        const 연도누적신청 = await jejuYearSubmittedSummaryKo(prisma, employee.id);
        await maybeApplicantAlimtalk(prisma, employee, "JEJU_REJECTED", {
          신청자명: employee.name,
          투숙객명: row.guestName,
          ...applicantDateParams(row),
          반려사유: row.rejectComment?.trim() || "-",
          연도누적신청,
        });
      } else {
        await maybeApplicantAlimtalk(prisma, employee, "JEJU_REJECTED", {
          신청자명: employee.name,
          ...applicantDateParams(row),
          반려사유: row.rejectComment?.trim() || "-",
        });
      }
      break;
    }
    case "applicant_cancelled": {
      if (!employee) break;
      if (noteV2) {
        const 연도누적신청 = await jejuYearSubmittedSummaryKo(prisma, employee.id);
        await maybeApplicantAlimtalk(prisma, employee, "JEJU_CANCELLED", {
          신청자명: employee.name,
          투숙객명: row.guestName,
          ...applicantDateParams(row),
          연도누적신청,
        });
      } else {
        await maybeApplicantAlimtalk(prisma, employee, "JEJU_CANCELLED", {
          신청자명: employee.name,
          ...applicantDateParams(row),
        });
      }
      break;
    }
    case "cancel_step1_notify": {
      const 직원명3 = await applicantEmployeeName(prisma, row.employeeId);
      if (ch.email && stepCfg?.email) {
        await tryJejuMail("cancel_step1_notify", () =>
          sendMail({
            to: stepCfg.email!,
            subject: `[제주숙소] 취소 요청 승인 필요 - ${row.guestName} (${period})`,
            text: `제주 숙소 취소 요청이 접수되었습니다. 복지부 취소 승인이 필요합니다.\n직원 신청자: ${직원명3 || "-"}\n투숙(표기명): ${row.guestName}\n기간: ${period}`,
          }),
        );
      }
      const cancel1Params = noteV2
        ? await staffJejuAlimtalkParams(prisma, row, "-", "취소 복지부 승인")
        : legacyJejuStaffAlimParams(row, period, "", "취소 복지부 승인");
      await sendStep1StaffAlimtalkToPhones(prisma, stepCfg, "JEJU_STAFF_CANCEL", cancel1Params, "cancel_step1_notify");
      break;
    }
    case "cancel_step2_notify": {
      const 직원명4 = await applicantEmployeeName(prisma, row.employeeId);
      if (ch.email && stepCfg?.email) {
        await tryJejuMail("cancel_step2_notify", () =>
          sendMail({
            to: stepCfg.email!,
            subject: `[제주숙소] 입금취소 처리 필요 - ${row.guestName} (${period})`,
            text: `제주 숙소 취소 복지부 승인이 완료되었습니다. 입금취소 처리가 필요합니다.\n직원 신청자: ${직원명4 || "-"}\n투숙(표기명): ${row.guestName}\n기간: ${period}\n입금자명: ${row.depositorName}`,
          }),
        );
      }
      if (ch.alimtalk && stepCfg?.phone) {
        const p = noteV2
          ? await staffJejuAlimtalkParams(prisma, row, row.depositorName ?? "-", "입금 취소 처리")
          : legacyJejuStaffAlimParams(row, period, row.depositorName ?? "-", "입금 취소 처리");
        await tryJejuStaffAlimtalk(prisma, "cancel_step2_notify", stepCfg.phone, "JEJU_STAFF_CANCEL", p);
      }
      break;
    }
  }
}

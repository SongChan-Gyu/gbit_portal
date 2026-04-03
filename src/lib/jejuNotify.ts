/**
 * 제주 숙소 알림 헬퍼
 *
 * SystemConfig.jejuApprovalNotify 에 다음 구조로 저장:
 * {
 *   "step1": { "phone": "01000000000", "email": "welfare@company.com" },
 *   "step2": { "phone": "01011111111", "email": "pm@company.com" }
 * }
 *
 * sendJejuNotification(type, employee, row, step) 로 호출.
 * 실제 알림 전송은 sendEmail / 알림톡을 사용하며,
 * 미설정 시 콘솔 로그만 남기고 에러를 내지 않는다.
 */

import { sendMail } from "@/lib/email";
import type { DB } from "@/lib/db";

type NotifyType =
  | "step1_notify"          // 복지부에게 1차 승인 요청
  | "step2_notify"          // PM에게 입금확인 요청
  | "applicant_step1_approved"  // 신청자: 1차 승인됨
  | "applicant_approved"    // 신청자: 최종 승인(입금확인 완료)
  | "applicant_rejected"    // 신청자: 반려
  | "applicant_cancelled"   // 신청자: 취소 처리 완료
  | "cancel_step1_notify"   // 복지부에게 취소 1차 승인 요청
  | "cancel_step2_notify";  // PM에게 입금취소 처리 요청

interface NotifyEmployee {
  id: string;
  name: string;
  phone?: string | null;
  alimtalkEnabled?: boolean | null;
}

interface NotifyRow {
  id: string;
  startDate: Date;
  endDate: Date;
  nights: number;
  guestName: string;
  depositorName: string;
}

async function getNotifyConfig(prisma: DB): Promise<{ step1?: { phone?: string; email?: string }; step2?: { phone?: string; email?: string } }> {
  try {
    const cfg = await (prisma as any).systemConfig.findUnique({ where: { key: "jejuApprovalNotify" } });
    if (cfg?.value) return JSON.parse(cfg.value);
  } catch {
    // ignore
  }
  return {};
}

function dateLabel(row: NotifyRow): string {
  const s = row.startDate.toISOString().slice(0, 10);
  const e = row.endDate.toISOString().slice(0, 10);
  return `${s} ~ ${e} (${row.nights}박)`;
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

  switch (type) {
    case "step1_notify": {
      // 복지부에게: 새 신청 1차 승인 요청
      if (stepCfg?.email) {
        await sendMail({
          to: stepCfg.email,
          subject: `[제주숙소] 1차 승인 요청 - ${row.guestName} (${period})`,
          text: `제주 숙소 신청이 접수되어 1차 승인이 필요합니다.\n신청자: ${row.guestName}\n기간: ${period}\n입금자명: ${row.depositorName}`,
        });
      }
      break;
    }
    case "step2_notify": {
      // PM에게: 입금확인 요청
      if (stepCfg?.email) {
        await sendMail({
          to: stepCfg.email,
          subject: `[제주숙소] 입금확인 요청 - ${row.guestName} (${period})`,
          text: `복지부 승인이 완료되어 입금확인이 필요합니다.\n신청자: ${row.guestName}\n기간: ${period}\n입금자명: ${row.depositorName}`,
        });
      }
      break;
    }
    case "applicant_step1_approved": {
      if (!employee) break;
      if (employee.phone && employee.alimtalkEnabled !== false) {
        console.info(`[jejuNotify] 알림톡 → ${employee.name}(${employee.phone}): 제주숙소 1차 승인 완료 (${period})`);
      }
      break;
    }
    case "applicant_approved": {
      if (!employee) break;
      if (employee.phone && employee.alimtalkEnabled !== false) {
        console.info(`[jejuNotify] 알림톡 → ${employee.name}(${employee.phone}): 제주숙소 최종 승인/입금확인 완료 (${period})`);
      }
      break;
    }
    case "applicant_rejected": {
      if (!employee) break;
      if (employee.phone && employee.alimtalkEnabled !== false) {
        console.info(`[jejuNotify] 알림톡 → ${employee.name}(${employee.phone}): 제주숙소 반려 (${period})`);
      }
      break;
    }
    case "applicant_cancelled": {
      if (!employee) break;
      if (employee.phone && employee.alimtalkEnabled !== false) {
        console.info(`[jejuNotify] 알림톡 → ${employee.name}(${employee.phone}): 제주숙소 취소 완료 (${period})`);
      }
      break;
    }
    case "cancel_step1_notify": {
      if (stepCfg?.email) {
        await sendMail({
          to: stepCfg.email,
          subject: `[제주숙소] 취소 요청 승인 필요 - ${row.guestName} (${period})`,
          text: `제주 숙소 취소 요청이 접수되었습니다. 1차 취소 승인이 필요합니다.\n신청자: ${row.guestName}\n기간: ${period}`,
        });
      }
      break;
    }
    case "cancel_step2_notify": {
      if (stepCfg?.email) {
        await sendMail({
          to: stepCfg.email,
          subject: `[제주숙소] 입금취소 처리 필요 - ${row.guestName} (${period})`,
          text: `제주 숙소 취소 1차 승인이 완료되었습니다. 입금취소 처리가 필요합니다.\n신청자: ${row.guestName}\n기간: ${period}\n입금자명: ${row.depositorName}`,
        });
      }
      break;
    }
  }
}

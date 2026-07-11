import { isWelfareDept } from "@/lib/jeju";

export const HEALTH_CHECK_FORM_SLUG = "health-check-2026";

/** 건강검진 양식 조회 (전체 내역 화면: 비활성 양식도 포함) */
export function healthCheckFormWhere(activeOnly: boolean) {
  return activeOnly
    ? { slug: HEALTH_CHECK_FORM_SLUG, isActive: true }
    : { slug: HEALTH_CHECK_FORM_SLUG };
}

/** 답변 맵에서 검진 대상자 성명 */
export function healthCheckSubjectName(
  fields: { label: string }[],
  byLabel: Record<string, string>,
): string {
  const nameField = fields.find((f) => f.label.includes("성명"));
  if (nameField && byLabel[nameField.label]?.trim()) return byLabel[nameField.label].trim();
  return "";
}

/** 복지부·관리자: 건강검진 전사 신청 내역 조회 */
export function canViewAllHealthCheckSubmissions(
  emp: { dutyDept?: string | null } | null,
  role: string | null | undefined,
): boolean {
  return isWelfareDept(emp) || role === "ADMIN";
}

/** 본인 신청 건 또는 복지부·관리자 */
export function canDeleteHealthCheckSubmission(
  submission: { employeeId: string | null },
  viewerEmployeeId: string | null,
  emp: { dutyDept?: string | null } | null,
  role: string | null | undefined,
): boolean {
  if (viewerEmployeeId && submission.employeeId === viewerEmployeeId) return true;
  return canViewAllHealthCheckSubmissions(emp, role);
}

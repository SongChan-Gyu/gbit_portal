import { isWelfareDept } from "@/lib/jeju";
import { todayKstYmd } from "@/lib/dateUtils";

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

export function healthCheckApplicationYear(form?: { title?: string | null; slug?: string | null }): number {
  const source = `${form?.title ?? ""} ${form?.slug ?? ""} ${HEALTH_CHECK_FORM_SLUG}`;
  const match = source.match(/20\d{2}/);
  return match ? Number(match[0]) : Number(todayKstYmd().slice(0, 4));
}

export function checkHealthCheckEligibility(
  emp: { birthDate?: Date | string | null; employeeType?: string | null } | null,
  form?: { title?: string | null; slug?: string | null },
): { ok: true; applicationYear: number } | { ok: false; reason: string; applicationYear: number } {
  const applicationYear = healthCheckApplicationYear(form);

  if (!emp?.birthDate) {
    return {
      ok: false,
      applicationYear,
      reason: "생년월일 정보가 없어 건강검진을 신청할 수 없습니다. 관리자에게 생년월일 등록을 요청해 주세요.",
    };
  }

  const birthYear =
    emp.birthDate instanceof Date
      ? emp.birthDate.getFullYear()
      : Number(String(emp.birthDate).slice(0, 4));

  if (!birthYear || !Number.isFinite(birthYear)) {
    return {
      ok: false,
      applicationYear,
      reason: "생년월일 정보가 올바르지 않아 건강검진을 신청할 수 없습니다. 관리자에게 생년월일 확인을 요청해 주세요.",
    };
  }

  if (emp.employeeType === "EXTERNAL" && birthYear % 2 !== applicationYear % 2) {
    const birthParity = birthYear % 2 === 0 ? "짝수" : "홀수";
    const applicationParity = applicationYear % 2 === 0 ? "짝수" : "홀수";
    return {
      ok: false,
      applicationYear,
      reason: `외부개발자는 태어난 해와 신청년도의 홀짝이 같을 때만 신청할 수 있습니다. (${birthYear}년 ${birthParity} 출생, ${applicationYear}년 ${applicationParity}년도)`,
    };
  }

  return { ok: true, applicationYear };
}

function normalizeKoreanName(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

/** 건강검진은 직원 본인만 신청 가능 */
export function healthCheckSelfOnlyError(
  fields: { id: string; label: string }[],
  answerMap: Record<string, unknown>,
  employeeName: string | null | undefined,
): string | null {
  const byLabel: Record<string, string> = {};
  for (const f of fields) byLabel[f.label] = String(answerMap[f.id] ?? "").trim();

  const subjectName = healthCheckSubjectName(fields, byLabel);
  if (employeeName && subjectName && normalizeKoreanName(subjectName) !== normalizeKoreanName(employeeName)) {
    return "건강검진은 가족 신청 없이 본인만 신청할 수 있습니다. 성명은 본인 이름으로 입력해 주세요.";
  }

  const relatedEmployeeName = Object.entries(byLabel).find(([label]) => label.includes("관계임직원"))?.[1] ?? "";
  if (relatedEmployeeName.trim()) {
    return "건강검진은 가족 신청 없이 본인만 신청할 수 있습니다. 관계임직원 성명은 입력할 수 없습니다.";
  }

  const relationship = Object.entries(byLabel).find(([label]) => label.includes("직원과의"))?.[1] ?? "";
  if (relationship.trim() && relationship.trim() !== "본인") {
    return "건강검진은 가족 신청 없이 본인만 신청할 수 있습니다. 직원과의 관계는 본인만 가능합니다.";
  }

  return null;
}

/** 건강검진은 관계임직원 성명(본인일 때)을 제외하고 공란 제출 불가 */
export function healthCheckBlankFieldError(
  fields: { id: string; label: string }[],
  answerMap: Record<string, unknown>,
): string | null {
  const byLabel: Record<string, string> = {};
  for (const f of fields) byLabel[f.label] = String(answerMap[f.id] ?? "").trim();

  const relationship =
    Object.entries(byLabel).find(([label]) => label.includes("직원과의"))?.[1]?.trim() ?? "";

  for (const f of fields) {
    const value = String(answerMap[f.id] ?? "").trim();
    const isRelatedEmployeeName = f.label.includes("관계임직원");
    if (isRelatedEmployeeName && relationship === "본인") continue;

    if (!value) {
      if (isRelatedEmployeeName) {
        return "가족 검진 신청 시 관계임직원 성명을 입력해 주세요. 본인 신청인 경우 직원과의 관계를 '본인'으로 입력하면 공란으로 둘 수 있습니다.";
      }
      return `필수 항목을 입력해 주세요: ${f.label}`;
    }
  }

  return null;
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

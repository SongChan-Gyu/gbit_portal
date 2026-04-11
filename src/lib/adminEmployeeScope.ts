/**
 * 휴가 부여·현황·스탬프 관리·귀속연도 일괄 초기화 등에서 포함할 직원 상태.
 * 퇴직(INACTIVE) 제외 — 초대 전에 휴가·스탬프를 선세팅할 수 있도록 미초대(PENDING)·초대 발송(INVITED) 포함.
 */
export const ADMIN_LEAVE_EMPLOYEE_STATUSES = ["PENDING", "INVITED", "ACTIVE"] as const;

export function employeeEligibleForAdminLeaveSetup(status: string): boolean {
  return (ADMIN_LEAVE_EMPLOYEE_STATUSES as readonly string[]).includes(status);
}

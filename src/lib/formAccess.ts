import type { DB } from "@/lib/db";
import {
  audienceLabel,
  audienceVisibleOrClause,
  employeeMatchesAudience,
  employeesForAudience,
  type AudienceSlice,
} from "@/lib/audienceAccess";

export type FormAccessSlice = AudienceSlice & { id: string };

/** 로그인 직원이 해당 양식에 접근·제출 가능한지 */
export async function employeeCanAccessForm(
  prisma: DB,
  employeeId: string | null,
  employeeType: string | null | undefined,
  form: FormAccessSlice,
): Promise<boolean> {
  return employeeMatchesAudience(prisma, employeeId, employeeType, form);
}

/** 대시보드·사이드바 유동양식 메뉴: 사용자에게 보여 줄 양식 OR 조건 */
export function formVisibleToUserOrClause(employeeId: string, isExternal: boolean) {
  return audienceVisibleOrClause(employeeId, isExternal);
}

/** 알림톡 발송용 직원 목록 (audience·그룹 반영) */
export async function employeesForFormAlimtalk(
  prisma: DB,
  form: AudienceSlice,
) {
  return employeesForAudience(prisma, form);
}

export { audienceLabel };

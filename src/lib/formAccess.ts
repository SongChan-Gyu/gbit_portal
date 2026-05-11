import type { DB } from "@/lib/db";

export type FormAccessSlice = {
  id: string;
  audience: string;
  targetGroupId: string | null;
};

/** 로그인 직원이 해당 양식에 접근·제출 가능한지 */
export async function employeeCanAccessForm(
  prisma: DB,
  employeeId: string | null,
  employeeType: string | null | undefined,
  form: FormAccessSlice,
): Promise<boolean> {
  if (form.audience === "ALL") return true;
  if (!employeeId) return false;
  if (form.audience === "INTERNAL") return employeeType !== "EXTERNAL";
  if (form.audience === "EXTERNAL") return employeeType === "EXTERNAL";
  if (form.audience === "GROUP") {
    if (!form.targetGroupId) return false;
    const m = await prisma.formTargetGroupMember.findFirst({
      where: { groupId: form.targetGroupId, employeeId },
    });
    return !!m;
  }
  return false;
}

/** 대시보드·사이드바 유동양식 메뉴: 사용자에게 보여 줄 양식 OR 조건 */
export function formVisibleToUserOrClause(employeeId: string, isExternal: boolean) {
  const groupClause = {
    audience: "GROUP" as const,
    targetGroup: { members: { some: { employeeId } } },
  };
  if (isExternal) {
    return {
      OR: [{ audience: "ALL" as const }, { audience: "EXTERNAL" as const }, groupClause],
    };
  }
  return {
    OR: [{ audience: "ALL" as const }, { audience: "INTERNAL" as const }, groupClause],
  };
}

/** 알림톡 발송용 직원 목록 (audience·그룹 반영) */
export async function employeesForFormAlimtalk(
  prisma: DB,
  form: { audience: string; targetGroupId: string | null },
) {
  if (form.audience === "GROUP" && form.targetGroupId) {
    return prisma.employee.findMany({
      where: {
        status: { in: ["ACTIVE", "INVITED"] },
        formTargetGroupMembers: { some: { groupId: form.targetGroupId } },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        employeeType: true,
        alimtalkEnabled: true,
        team: { select: { name: true } },
        position: true,
      },
      orderBy: [{ employeeType: "asc" }, { name: "asc" }],
    });
  }

  const typeFilter: string[] =
    form.audience === "INTERNAL"
      ? ["FULL", "FREE"]
      : form.audience === "EXTERNAL"
        ? ["EXTERNAL"]
        : ["FULL", "FREE", "EXTERNAL"];

  return prisma.employee.findMany({
    where: {
      employeeType: { in: typeFilter },
      status: { in: ["ACTIVE", "INVITED"] },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      employeeType: true,
      alimtalkEnabled: true,
      team: { select: { name: true } },
      position: true,
    },
    orderBy: [{ employeeType: "asc" }, { name: "asc" }],
  });
}

export function audienceLabel(
  audience: string,
  targetGroupName?: string | null,
): string {
  if (audience === "ALL") return "전체";
  if (audience === "INTERNAL") return "내부직원";
  if (audience === "EXTERNAL") return "외부개발자";
  if (audience === "GROUP") return targetGroupName ? `그룹: ${targetGroupName}` : "지정 그룹";
  return audience;
}

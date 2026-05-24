import type { DB } from "@/lib/db";

export type AudienceCode = "ALL" | "INTERNAL" | "EXTERNAL" | "GROUP";

export type AudienceSlice = {
  audience: string;
  employeeGroupId?: string | null;
  /** @deprecated Form API 호환 */
  targetGroupId?: string | null;
};

export function resolveEmployeeGroupId(slice: AudienceSlice): string | null {
  return slice.employeeGroupId ?? slice.targetGroupId ?? null;
}

/** 로그인 직원이 audience 대상에 포함되는지 */
export async function employeeMatchesAudience(
  prisma: DB,
  employeeId: string | null,
  employeeType: string | null | undefined,
  slice: AudienceSlice,
): Promise<boolean> {
  const audience = slice.audience;
  if (audience === "ALL") return !!employeeId;
  if (!employeeId) return false;
  if (audience === "INTERNAL") return employeeType !== "EXTERNAL";
  if (audience === "EXTERNAL") return employeeType === "EXTERNAL";
  if (audience === "GROUP") {
    const gid = resolveEmployeeGroupId(slice);
    if (!gid) return false;
    const m = await prisma.employeeGroupMember.findFirst({
      where: { groupId: gid, employeeId },
    });
    return !!m;
  }
  return false;
}

/** Prisma where: 사용자에게 보이는 audience OR 조건 */
export function audienceVisibleOrClause(employeeId: string, isExternal: boolean) {
  const groupClause = {
    audience: "GROUP" as const,
    employeeGroup: { members: { some: { employeeId } } },
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

/** 알림톡·발송용 직원 목록 */
export async function employeesForAudience(
  prisma: DB,
  slice: AudienceSlice,
) {
  const gid = resolveEmployeeGroupId(slice);
  if (slice.audience === "GROUP" && gid) {
    return prisma.employee.findMany({
      where: {
        status: { in: ["ACTIVE", "INVITED"] },
        employeeGroupMembers: { some: { groupId: gid } },
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
    slice.audience === "INTERNAL"
      ? ["FULL", "FREE"]
      : slice.audience === "EXTERNAL"
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
  groupName?: string | null,
): string {
  if (audience === "ALL") return "전체";
  if (audience === "INTERNAL") return "내부직원";
  if (audience === "EXTERNAL") return "외부개발자";
  if (audience === "GROUP") return groupName ? `그룹: ${groupName}` : "지정 그룹";
  return audience;
}

export const AUDIENCE_OPTIONS: { value: AudienceCode; label: string }[] = [
  { value: "ALL", label: "전체 (로그인 사용자)" },
  { value: "INTERNAL", label: "내부직원" },
  { value: "EXTERNAL", label: "외부개발자" },
  { value: "GROUP", label: "지정 그룹" },
];

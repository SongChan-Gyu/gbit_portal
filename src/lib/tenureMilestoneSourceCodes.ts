import type { DB } from "@/lib/db";

/**
 * 입사 주년 자동 부여에 쓰는 할당 sourceCode 목록 (DB만 기준).
 * - 활성 LeaveType 중 hireAnniversaryYears·allocationSourceCode 가 있는 행
 * - 활성 AllocationSourceConfig 중 tenureYears 가 있는 행
 */
export async function loadTenureMilestoneSourceCodes(db: DB): Promise<string[]> {
  const [fromLeaveTypes, fromConfigs] = await Promise.all([
    db.leaveType.findMany({
      where: {
        isActive: true,
        hireAnniversaryYears: { not: null },
        allocationSourceCode: { not: null },
      },
      select: { allocationSourceCode: true },
    }),
    db.allocationSourceConfig.findMany({
      where: { isActive: true, tenureYears: { not: null } },
      select: { sourceCode: true },
    }),
  ]);
  return [
    ...new Set([
      ...fromLeaveTypes.map((t) => t.allocationSourceCode!).filter(Boolean),
      ...fromConfigs.map((c) => c.sourceCode),
    ]),
  ];
}

import { kstYmd } from "@/lib/dateUtils";

/** PrismaClient / TransactionClient / 시드용 PrismaClient 등 findMany만 맞으면 됨 */
export type TenureAllocationDb = {
  leaveAllocation: {
    findMany: (args: {
      where: { employeeId: string; sourceCode: string };
      select: { id: true; validFrom: true; note: true };
    }) => Promise<Array<{ id: string; validFrom: Date; note: string | null }>>;
  };
};

/**
 * 동일 근속 마일스톤(같은 입사 주년일) 할당이 이미 있는지 — validFrom의 KST 달력일 또는 note에 YYYY-MM-DD 포함.
 */
export async function findTenureMilestoneAllocation(
  db: TenureAllocationDb,
  employeeId: string,
  sourceCode: string,
  anniversaryYmd: string,
) {
  const rows = await db.leaveAllocation.findMany({
    where: { employeeId, sourceCode },
    select: { id: true, validFrom: true, note: true },
  });
  return (
    rows.find((r) => kstYmd(r.validFrom) === anniversaryYmd) ??
    rows.find((r) => r.note?.includes(anniversaryYmd)) ??
    null
  );
}

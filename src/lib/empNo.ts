import type { PrismaClient } from "@prisma/client";

/**
 * 기존 사번 중 E + 숫자 패턴의 최대값을 구한 뒤, 다음 번호를 반환 (예: E001, E002, ... E099, E100)
 */
export async function getNextEmpNo(prisma: PrismaClient): Promise<string> {
  const employees = await prisma.employee.findMany({
    select: { empNo: true },
  });
  let maxNum = 0;
  for (const e of employees) {
    const m = /^E(\d+)$/i.exec(e.empNo);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `E${String(next).padStart(3, "0")}`;
}

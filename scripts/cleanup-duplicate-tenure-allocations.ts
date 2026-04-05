/**
 * 입사 주년 근속 휴가(AllocationSourceConfig.tenureYears 또는 LeaveType.hireAnniversaryYears) 할당 중
 * 동일 사원·동일 sourceCode·동일 부여일(KST)로 중복된 활성 행을 정리한다.
 *
 * - 유지: usedDays가 가장 큰 행, 동률이면 id가 가장 오래된 행
 * - 삭제: 나머지 중 usedDays === 0 인 행만 (사용이 찍힌 중복은 건너뛰고 경고 출력)
 *
 * 실행:
 *   npx tsx scripts/cleanup-duplicate-tenure-allocations.ts        # dry-run (기본)
 *   npx tsx scripts/cleanup-duplicate-tenure-allocations.ts --apply  # 실제 삭제
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { kstYmd } from "../src/lib/dateUtils";

const prisma = new PrismaClient();

async function loadTenureSourceCodes(): Promise<Set<string>> {
  const codes = new Set<string>();
  const cfgs = await prisma.allocationSourceConfig.findMany({
    where: { isActive: true, tenureYears: { not: null } },
    select: { sourceCode: true },
  });
  for (const c of cfgs) codes.add(c.sourceCode);
  try {
    const lt = await prisma.leaveType.findMany({
      where: {
        isActive: true,
        hireAnniversaryYears: { not: null },
        allocationSourceCode: { not: null },
      },
      select: { allocationSourceCode: true },
    });
    for (const row of lt) {
      if (row.allocationSourceCode) codes.add(row.allocationSourceCode);
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022") {
      console.warn(
        "[안내] LeaveType.hireAnniversaryYears 컬럼 없음 — 마이그레이션 전에는 AllocationSourceConfig.tenureYears 코드만 사용합니다.",
      );
    } else throw e;
  }
  return codes;
}

function groupKey(employeeId: string, sourceCode: string, ymd: string) {
  return `${employeeId}\t${sourceCode}\t${ymd}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sourceCodes = await loadTenureSourceCodes();
  if (sourceCodes.size === 0) {
    console.log("tenure 관련 sourceCode가 없습니다. 종료.");
    return;
  }

  const rows = await prisma.leaveAllocation.findMany({
    where: { isActive: true, sourceCode: { in: [...sourceCodes] } },
    orderBy: [{ employeeId: "asc" }, { sourceCode: "asc" }, { validFrom: "asc" }],
    select: {
      id: true,
      employeeId: true,
      sourceCode: true,
      validFrom: true,
      usedDays: true,
      totalDays: true,
      createdAt: true,
    },
  });

  const buckets = new Map<string, typeof rows>();
  for (const r of rows) {
    const ymd = kstYmd(r.validFrom);
    const k = groupKey(r.employeeId, r.sourceCode, ymd);
    const arr = buckets.get(k) ?? [];
    arr.push(r);
    buckets.set(k, arr);
  }

  let wouldDelete = 0;
  let skippedUsed = 0;

  for (const [, list] of buckets) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => {
      if (b.usedDays !== a.usedDays) return b.usedDays - a.usedDays;
      return a.id.localeCompare(b.id);
    });
    const keep = sorted[0]!;
    const rest = sorted.slice(1);
    for (const r of rest) {
      if (r.usedDays > 0) {
        skippedUsed++;
        console.warn(
          `[건너뜀] 중복이나 사용일 있음: ${r.id} emp=${r.employeeId} ${r.sourceCode} ${kstYmd(r.validFrom)} used=${r.usedDays} (유지 후보=${keep.id})`,
        );
        continue;
      }
      wouldDelete++;
      if (apply) {
        await prisma.leaveAllocation.delete({ where: { id: r.id } });
        console.log(`삭제: ${r.id} ${r.sourceCode} ${kstYmd(r.validFrom)}`);
      } else {
        console.log(`[dry-run] 삭제 예정: ${r.id} ${r.sourceCode} ${kstYmd(r.validFrom)}`);
      }
    }
  }

  console.log(
    apply
      ? `완료: 삭제 ${wouldDelete}건, 사용 중복 경고 ${skippedUsed}건`
      : `dry-run: 삭제 대상 ${wouldDelete}건, 사용 중복으로 보류 ${skippedUsed}건 (--apply 로 실행)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

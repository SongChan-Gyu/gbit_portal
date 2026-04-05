import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { loadTenureMilestoneSourceCodes } from "@/lib/tenureMilestoneSourceCodes";
import { kstYmd } from "@/lib/dateUtils";

export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const empId   = searchParams.get("empId") ?? undefined;
  const type    = searchParams.get("type") ?? "all";   // all | monthly | tenure
  const take    = Math.min(parseInt(searchParams.get("take") ?? "100"), 500);
  const skip    = parseInt(searchParams.get("skip") ?? "0");

  const tenureCodes = await loadTenureMilestoneSourceCodes(prisma);
  if (type === "tenure" && tenureCodes.length === 0) {
    return NextResponse.json({ total: 0, rows: [] });
  }

  const monthlyOr = [
    { sourceCode: { startsWith: "MONTHLY_ACCRUAL_" } },
    { sourceCode: "BASE_ANNUAL", note: { contains: "MONTHLY_ACCRUAL:" } },
    { sourceCode: "BASE_ANNUAL", note: { contains: "MONTHLY_ACCRUAL_POOL" } },
  ];
  const tenureOr = tenureCodes.length > 0 ? [{ sourceCode: { in: tenureCodes } }] : [];

  // sourceCode/노트 기반 필터 — 월별적립은 신규(BASE_ANNUAL+note키) + 레거시(MONTHLY_ACCRUAL_*) 모두 포함
  const where: any = {
    ...(empId ? { employeeId: empId } : {}),
    ...(type === "monthly"
      ? { OR: monthlyOr }
      : type === "tenure"
      ? { sourceCode: { in: tenureCodes } }
      : { OR: [...monthlyOr, ...tenureOr] }),
  };

  const [total, allocations] = await Promise.all([
    prisma.leaveAllocation.count({ where }),
    prisma.leaveAllocation.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true, name: true, empNo: true,
            team: { select: { name: true } },
            hireDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
  ]);
  const [sourceConfigs, leaveTypes] = await Promise.all([
    prisma.allocationSourceConfig.findMany({
      where: { isActive: true },
      select: { sourceCode: true, label: true },
    }),
    prisma.leaveType.findMany({
      where: { isActive: true, allocationSourceCode: { not: null } },
      select: { allocationSourceCode: true, name: true },
    }),
  ]);
  const sourceLabelMap = new Map<string, string>();
  sourceConfigs.forEach((s) => sourceLabelMap.set(s.sourceCode, s.label));
  leaveTypes.forEach((lt) => {
    if (lt.allocationSourceCode && !sourceLabelMap.has(lt.allocationSourceCode)) {
      sourceLabelMap.set(lt.allocationSourceCode, lt.name);
    }
  });

  // 부여 유형 레이블
  const rows = allocations.map((a) => {
    const legacyMonthly = a.sourceCode.startsWith("MONTHLY_ACCRUAL_");
    const monthlyFromNote = a.note?.match(/MONTHLY_ACCRUAL:(\d{4}-\d{2})/)?.[1] ?? null;
    const poolMonths = a.note?.match(/ACCURED_MONTHS:([^·\s]+)/)?.[1] ?? null;
    const isMonthly =
      legacyMonthly || !!monthlyFromNote || !!(a.note && a.note.includes("MONTHLY_ACCRUAL_POOL"));
    const month = legacyMonthly
      ? a.sourceCode.replace("MONTHLY_ACCRUAL_", "").replace("_", "-")
      : monthlyFromNote ?? (poolMonths ? poolMonths.replace(/,/g, "·") : null);

    const typeLabel = isMonthly
      ? `월별적립 (${month})`
      : sourceLabelMap.get(a.sourceCode) ?? a.label ?? a.sourceCode;

    const now     = new Date();
    const validUntil = new Date(a.validUntil);
    const validFrom  = new Date(a.validFrom);
    const remain  = Math.max(0, a.totalDays - a.usedDays);
    const status  = !a.isActive          ? "비활성"
                  : validUntil < now     ? "만료"
                  : validFrom > now      ? "미시작"
                  : remain <= 0          ? "소진"
                  : "유효";

    return {
      id:          a.id,
      employeeId:  a.employeeId,
      empName:     a.employee.name,
      empNo:       a.employee.empNo,
      teamName:    a.employee.team?.name ?? "-",
      hireDate:    kstYmd(a.employee.hireDate),
      sourceCode:  a.sourceCode,
      typeLabel,
      isMonthly,
      label:       a.label,
      totalDays:   a.totalDays,
      usedDays:    a.usedDays,
      remain,
      validFrom:   kstYmd(a.validFrom),
      validUntil:  kstYmd(a.validUntil),
      note:        a.note,
      isActive:    a.isActive,
      status,
      createdAt:   a.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ total, rows });
}

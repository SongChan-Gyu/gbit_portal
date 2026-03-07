import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** 스케줄러가 자동 부여하는 sourceCode 패턴 */
const AUTO_SOURCE_PREFIXES = ["MONTHLY_ACCRUAL_", "TENURE_"];
const TENURE_CODES = ["TENURE_1Y", "TENURE_5Y", "TENURE_10Y"];

function isAutoSource(code: string) {
  return code.startsWith("MONTHLY_ACCRUAL_") || TENURE_CODES.includes(code);
}

export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  if (!["ADMIN","PM"].includes(user?.role ?? ""))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const empId   = searchParams.get("empId") ?? undefined;
  const type    = searchParams.get("type") ?? "all";   // all | monthly | tenure
  const take    = Math.min(parseInt(searchParams.get("take") ?? "100"), 500);
  const skip    = parseInt(searchParams.get("skip") ?? "0");

  // sourceCode 필터 구성
  let sourceFilter: object;
  if (type === "monthly") {
    sourceFilter = { startsWith: "MONTHLY_ACCRUAL_" };
  } else if (type === "tenure") {
    sourceFilter = { in: TENURE_CODES };
  } else {
    // all: MONTHLY_ACCRUAL_* OR TENURE_*
    sourceFilter = {
      OR: [
        { startsWith: "MONTHLY_ACCRUAL_" },
        { in: TENURE_CODES },
      ],
    } as any;
  }

  // sourceCode 필터 — prisma는 OR at field level 불가, where.OR 사용
  const where: any = {
    ...(empId ? { employeeId: empId } : {}),
    ...(type === "monthly"
      ? { sourceCode: { startsWith: "MONTHLY_ACCRUAL_" } }
      : type === "tenure"
      ? { sourceCode: { in: TENURE_CODES } }
      : {
          OR: [
            { sourceCode: { startsWith: "MONTHLY_ACCRUAL_" } },
            { sourceCode: { in: TENURE_CODES } },
          ],
        }),
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

  // 부여 유형 레이블
  const rows = allocations.map((a) => {
    const isMonthly = a.sourceCode.startsWith("MONTHLY_ACCRUAL_");
    const month     = isMonthly ? a.sourceCode.replace("MONTHLY_ACCRUAL_", "") : null;

    const typeLabel = isMonthly
      ? `월별적립 (${month})`
      : a.sourceCode === "TENURE_1Y"  ? "1년 근속"
      : a.sourceCode === "TENURE_5Y"  ? "5년 근속"
      : a.sourceCode === "TENURE_10Y" ? "10년 근속"
      : a.sourceCode;

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
      hireDate:    a.employee.hireDate.toISOString().slice(0, 10),
      sourceCode:  a.sourceCode,
      typeLabel,
      isMonthly,
      label:       a.label,
      totalDays:   a.totalDays,
      usedDays:    a.usedDays,
      remain,
      validFrom:   a.validFrom.toISOString().slice(0, 10),
      validUntil:  a.validUntil.toISOString().slice(0, 10),
      note:        a.note,
      isActive:    a.isActive,
      status,
      createdAt:   a.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ total, rows });
}

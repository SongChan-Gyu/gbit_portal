import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";

/** PM·관리자: 사원별 스탬프 장 목록(힐링 수동 소모 UI용) */
export async function GET(req: Request) {
  const session = await auth();
  const u = session?.user as { role?: string } | undefined;
  const guard = requirePMOrAdmin(u);
  if (guard) return guard;

  const employeeId = new URL(req.url).searchParams.get("employeeId")?.trim() ?? "";
  if (!employeeId) {
    return NextResponse.json({ error: "employeeId가 필요합니다." }, { status: 400 });
  }

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, status: "ACTIVE" },
    select: { id: true, name: true, empNo: true },
  });
  if (!emp) {
    return NextResponse.json({ error: "활성 직원을 찾을 수 없습니다." }, { status: 404 });
  }

  const cards = await prisma.stampCard.findMany({
    where: { employeeId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { stamps: true } } },
  });

  return NextResponse.json({
    employee: emp,
    cards: cards.map((c, idx) => ({
      id: c.id,
      /** 화면 표시용 순번 (1부터) */
      displayIndex: idx + 1,
      sortOrder: c.sortOrder,
      filledCount: c.filledCount,
      stampCount: c._count.stamps,
      healingUsed: c.healingUsed,
      afternoonUsed: c.afternoonUsed,
    })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import { getTenureScheduleForFiscalYears } from "@/lib/scheduler";
import { getFiscalYear } from "@/lib/workdays";

/**
 * GET /api/admin/tenure-schedule?fy=2025
 * 이번 귀속연도 + 다음 귀속연도에 스케줄러가 부여할(또는 이미 부여한) 근속휴가 예정 목록.
 * PM/ADMIN 전용.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const fyParam = searchParams.get("fy");
  const fy = fyParam ? parseInt(fyParam, 10) : getFiscalYear();
  if (Number.isNaN(fy)) {
    return NextResponse.json({ error: "fy 파라미터는 숫자여야 합니다." }, { status: 400 });
  }

  const rows = await getTenureScheduleForFiscalYears(fy);
  return NextResponse.json({ fy, rows });
}

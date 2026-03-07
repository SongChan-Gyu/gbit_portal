import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenureScheduleForFiscalYears } from "@/lib/scheduler";
import { getFiscalYear } from "@/lib/workdays";

/**
 * GET /api/leave/my-tenure-schedule?fy=2025
 * 로그인한 사용자 본인의 이번·다음 귀속연도 근속휴가 예정.
 * 일반 팀원(STAFF, TEAM_LEAD)도 조회 가능.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { employeeId?: string; role?: string } | undefined;
  if (!user?.employeeId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fyParam = searchParams.get("fy");
  const fy = fyParam ? parseInt(fyParam, 10) : getFiscalYear();
  if (Number.isNaN(fy)) {
    return NextResponse.json({ error: "fy 파라미터는 숫자여야 합니다." }, { status: 400 });
  }

  const allRows = await getTenureScheduleForFiscalYears(fy);
  const rows = allRows.filter((r) => r.employeeId === user.employeeId);
  return NextResponse.json({ fy, rows });
}

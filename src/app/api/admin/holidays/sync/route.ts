import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { syncHolidaysToDb, getHolidayYearRange } from "@/lib/holidays";

/**
 * GET /api/admin/holidays/sync?fromYear=2025&toYear=2027
 * POST body: { fromYear?, toYear? }
 * - 휴일 API에서 한국 공휴일을 가져와 DB에 반영합니다.
 * - fromYear, toYear 미지정 시 "현재·다음 귀속연도" 커버 범위로 자동 설정.
 */
export async function GET(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u); if (guard) return guard;

  const { searchParams } = new URL(req.url);
  let fromYear = searchParams.get("fromYear");
  let toYear = searchParams.get("toYear");
  if (!fromYear || !toYear) {
    const range = getHolidayYearRange();
    fromYear = String(range.fromYear);
    toYear = String(range.toYear);
  }
  const from = parseInt(fromYear, 10);
  const to = parseInt(toYear, 10);
  if (isNaN(from) || isNaN(to) || from > to)
    return NextResponse.json({ error: "fromYear, toYear가 올바르지 않습니다." }, { status: 400 });

  const result = await syncHolidaysToDb(prisma, from, to);
  if (result.failed)
    return NextResponse.json({ error: result.failed, synced: result.synced }, { status: 500 });
  return NextResponse.json({ ok: true, synced: result.synced, fromYear: from, toYear: to });
}

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u); if (guard) return guard;

  let from: number, to: number;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.fromYear != null && body.toYear != null) {
      from = parseInt(String(body.fromYear), 10);
      to = parseInt(String(body.toYear), 10);
    } else {
      const range = getHolidayYearRange();
      from = range.fromYear;
      to = range.toYear;
    }
  } catch {
    const range = getHolidayYearRange();
    from = range.fromYear;
    to = range.toYear;
  }
  if (isNaN(from) || isNaN(to) || from > to)
    return NextResponse.json({ error: "fromYear, toYear가 올바르지 않습니다." }, { status: 400 });

  const result = await syncHolidaysToDb(prisma, from, to);
  if (result.failed)
    return NextResponse.json({ error: result.failed, synced: result.synced }, { status: 500 });
  return NextResponse.json({ ok: true, synced: result.synced, fromYear: from, toYear: to });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runTenureCheck, previewTenureCheck } from "@/lib/scheduler";

export async function POST(req: NextRequest) {
  const cronSecret  = req.headers.get("x-cron-secret");
  const validSecret = process.env.CRON_SECRET;
  let actorId: string | undefined;

  if (cronSecret && validSecret && cronSecret === validSecret) {
    // cron 자동 실행 OK
  } else {
    const session = await auth();
    const user = session?.user as { role?: string; employeeId?: string } | undefined;
    if (!user || !["ADMIN","PM"].includes(user.role ?? "")) {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }
    actorId = user.employeeId;
  }

  const body = await req.json().catch(() => ({})) as { date?: string; window?: number; dryRun?: boolean };
  const { date, window: win = 0, dryRun = false } = body;

  try {
    const result = dryRun
      ? await previewTenureCheck(date, win)
      : await runTenureCheck(date, win, false, actorId);

    return NextResponse.json({
      success:    true,
      isDryRun:   result.isDryRun,
      targetDate: date ?? "오늘",
      granted:    result.granted.length,
      skipped:    result.skipped.length,
      errors:     result.errors.length,
      detail:     result,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import { runMonthlyAccrual, previewMonthlyAccrual } from "@/lib/scheduler";
import { todayStr } from "@/lib/workdays";

export async function POST(req: NextRequest) {
  const cronSecret  = req.headers.get("x-cron-secret");
  const validSecret = process.env.CRON_SECRET;
  let actorId: string | undefined;

  if (cronSecret && validSecret && cronSecret === validSecret) {
    // cron 자동 실행 OK
  } else {
    const session = await auth();
    const user = session?.user as { role?: string; employeeId?: string } | undefined;
    const guard = requirePMOrAdmin(user); if (guard) return guard;
    actorId = user?.employeeId;
  }

  const body = await req.json().catch(() => ({})) as { month?: string; dryRun?: boolean };
  const { month, dryRun = false } = body;

  try {
    const result = dryRun
      ? await previewMonthlyAccrual(month)
      : await runMonthlyAccrual(month, false, actorId);

    return NextResponse.json({
      success:  true,
      isDryRun: result.isDryRun,
      month:    month ?? todayStr().slice(0, 7),
      granted:  result.granted.length,
      skipped:  result.skipped.length,
      errors:   result.errors.length,
      detail:   result,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

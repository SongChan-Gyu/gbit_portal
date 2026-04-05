import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import { runJejuDepositDeadline } from "@/lib/jejuDepositDeadline";

export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get("x-cron-secret");
  const validSecret = process.env.CRON_SECRET;
  let actorId: string | undefined;

  if (cronSecret && validSecret && cronSecret === validSecret) {
    // cron 자동 실행
  } else {
    const session = await auth();
    const user = session?.user as { role?: string; employeeId?: string } | undefined;
    const guard = requirePMOrAdmin(user);
    if (guard) return guard;
    actorId = user?.employeeId;
  }

  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
  const dryRun = body.dryRun === true;

  try {
    const result = await runJejuDepositDeadline({ dryRun, actorId: actorId ?? null });
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

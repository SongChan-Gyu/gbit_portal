import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import { getUpcomingAnniversaries, getAccrualCandidates } from "@/lib/scheduler";

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const type  = searchParams.get("type") ?? "tenure";
  const days  = parseInt(searchParams.get("days") ?? "30");
  const month = searchParams.get("month") ?? undefined;

  if (type === "tenure") {
    const data = await getUpcomingAnniversaries(days);
    return NextResponse.json({ type: "tenure", data });
  }

  if (type === "accrual") {
    const data = await getAccrualCandidates(month);
    return NextResponse.json({ type: "accrual", data });
  }

  return NextResponse.json({ error: "type 파라미터 필요 (tenure | accrual)" }, { status: 400 });
}

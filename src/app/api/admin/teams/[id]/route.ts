import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { applyTeamLeaderChange, TeamLeaderSyncError } from "@/lib/teamLeader";

export async function PATCH(req: Request, { params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u); if (guard) return guard;

  const { name, leaderId, sortOrder } = await req.json();
  if (!name) return NextResponse.json({ error:"팀 이름 필수" }, { status:400 });

  try {
    const sync = await prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: { id },
        data: { name, sortOrder: sortOrder ?? 99 },
      });
      return applyTeamLeaderChange(tx, id, leaderId || null);
    });
    return NextResponse.json({ ok: true, warning: sync.warning ?? undefined, sync });
  } catch (e) {
    if (e instanceof TeamLeaderSyncError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

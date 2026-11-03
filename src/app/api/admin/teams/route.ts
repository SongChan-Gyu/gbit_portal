import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { applyTeamLeaderChange, TeamLeaderSyncError } from "@/lib/teamLeader";

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u); if (guard) return guard;

  const { name, leaderId, sortOrder } = await req.json();
  if (!name) return NextResponse.json({ error:"팀 이름 필수" }, { status:400 });

  try {
    const team = await prisma.$transaction(async (tx) => {
      const created = await tx.team.create({
        data: { name, sortOrder: sortOrder ?? 99 },
      });
      if (leaderId) {
        await applyTeamLeaderChange(tx, created.id, leaderId);
      }
      return created;
    });
    return NextResponse.json({ ok: true, id: team.id });
  } catch (e) {
    if (e instanceof TeamLeaderSyncError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}

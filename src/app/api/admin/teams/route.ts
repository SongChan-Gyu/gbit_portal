import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u); if (guard) return guard;

  const { name, leaderId, sortOrder } = await req.json();
  if (!name) return NextResponse.json({ error:"팀 이름 필수" }, { status:400 });

  const team = await prisma.team.create({ data:{ name, leaderId:leaderId||null, sortOrder:sortOrder??99 } });
  return NextResponse.json({ ok:true, id:team.id });
}

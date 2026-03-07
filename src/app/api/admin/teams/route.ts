import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  if (!["PM","ADMIN"].includes(u?.role ?? "")) return NextResponse.json({ error:"권한 없음" }, { status:403 });

  const { name, leaderId, sortOrder } = await req.json();
  if (!name) return NextResponse.json({ error:"팀 이름 필수" }, { status:400 });

  const team = await prisma.team.create({ data:{ name, leaderId:leaderId||null, sortOrder:sortOrder??99 } });
  return NextResponse.json({ ok:true, id:team.id });
}

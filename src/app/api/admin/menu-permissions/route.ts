import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  if (u?.role !== "ADMIN") return NextResponse.json({ error:"권한 없음" }, { status:403 });

  const perms = await req.json();
  await prisma.systemConfig.upsert({
    where: { key: "menuPermissions" },
    update: { value: JSON.stringify(perms) },
    create: { key: "menuPermissions", value: JSON.stringify(perms) },
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const config = await prisma.systemConfig.findUnique({ where:{ key:"menuPermissions" } });
  return NextResponse.json(config ? JSON.parse(config.value) : null);
}

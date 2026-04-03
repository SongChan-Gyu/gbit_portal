import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireAdmin(u); if (guard) return guard;

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

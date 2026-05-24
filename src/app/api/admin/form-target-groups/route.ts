import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireSettingsAccess } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u);
  if (guard) return guard;

  const groups = await prisma.employeeGroup.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { members: true, forms: true } } },
  });
  return NextResponse.json(groups);
}

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const employeeIds = Array.isArray(body.employeeIds) ? body.employeeIds.map(String) : [];
  if (name.length < 1) {
    return NextResponse.json({ error: "그룹 이름을 입력해 주세요." }, { status: 400 });
  }

  const g = await prisma.employeeGroup.create({
    data: {
      name: name.slice(0, 120),
      members:
        employeeIds.length > 0
          ? {
              create: employeeIds.map((employeeId: string) => ({ employeeId })),
            }
          : undefined,
    },
  });

  await writeAudit({
    entityType: "FormTargetGroup",
    entityId: g.id,
    action: "CREATED",
    actorId: u?.employeeId ?? null,
    after: { name: g.name, memberCount: employeeIds.length },
    ip: getIp(req) ?? undefined,
  });

  return NextResponse.json(g);
}

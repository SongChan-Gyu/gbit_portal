import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireSettingsAccess } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { writeAudit, getIp } from "@/lib/audit";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u);
  if (guard) return guard;

  const { id } = await ctx.params;
  const g = await prisma.employeeGroup.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          employee: {
            select: { id: true, name: true, empNo: true, employeeType: true, team: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!g) return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(g);
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u);
  if (guard) return guard;

  const { id } = await ctx.params;
  const existing = await prisma.employeeGroup.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = body.name != null ? String(body.name).trim() : existing.name;
  const employeeIds = Array.isArray(body.employeeIds) ? [...new Set(body.employeeIds.map(String))] : undefined;

  if (name.length < 1) {
    return NextResponse.json({ error: "그룹 이름을 입력해 주세요." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.employeeGroup.update({
      where: { id },
      data: { name: name.slice(0, 120) },
    });
    if (employeeIds) {
      await tx.employeeGroupMember.deleteMany({ where: { groupId: id } });
      if (employeeIds.length > 0) {
        const rows: { groupId: string; employeeId: string }[] = employeeIds.map((eid) => ({
          groupId: id,
          employeeId: String(eid),
        }));
        await tx.employeeGroupMember.createMany({
          data: rows,
        });
      }
    }
  });

  await writeAudit({
    entityType: "FormTargetGroup",
    entityId: id,
    action: "UPDATED",
    actorId: u?.employeeId ?? null,
    after: { name, memberCount: employeeIds?.length },
    ip: getIp(req) ?? undefined,
  });

  const g = await prisma.employeeGroup.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          employee: {
            select: { id: true, name: true, empNo: true, employeeType: true, team: { select: { name: true } } },
          },
        },
      },
    },
  });
  return NextResponse.json(g);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u);
  if (guard) return guard;

  const { id } = await ctx.params;
  const g = await prisma.employeeGroup.findUnique({
    where: { id },
    select: { name: true, _count: { select: { forms: true } } },
  });
  if (!g) return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });
  if (g._count.forms > 0) {
    return NextResponse.json(
      { error: "이 그룹을 사용 중인 양식이 있어 삭제할 수 없습니다. 양식에서 그룹 지정을 해제한 뒤 삭제해 주세요." },
      { status: 400 },
    );
  }
  await prisma.employeeGroup.delete({ where: { id } });
  await writeAudit({
    entityType: "FormTargetGroup",
    entityId: id,
    action: "DELETED",
    actorId: u?.employeeId ?? null,
    before: { name: g.name },
    ip: getIp(req) ?? undefined,
  });
  return NextResponse.json({ ok: true });
}

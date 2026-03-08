import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** ADMIN만. 테이블별 목록 조회. ?table=SystemConfig | Team | AllocationSourceConfig | SchedulerJobType */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "ADMIN만 조회 가능합니다." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table");
  const allowed = ["SystemConfig", "Team", "AllocationSourceConfig", "SchedulerJobType"];
  if (!table || !allowed.includes(table)) {
    return NextResponse.json({ error: "table 파라미터가 없거나 허용된 테이블이 아닙니다." }, { status: 400 });
  }

  try {
    if (table === "SystemConfig") {
      const rows = await prisma.systemConfig.findMany({ orderBy: { key: "asc" } });
      return NextResponse.json(rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt?.toISOString() })));
    }
    if (table === "Team") {
      const rows = await prisma.team.findMany({
        include: { leader: { select: { id: true, name: true, empNo: true } } },
        orderBy: { sortOrder: "asc" },
      });
      return NextResponse.json(rows.map((r) => ({
        id: r.id,
        name: r.name,
        sortOrder: r.sortOrder,
        leaderId: r.leaderId,
        leaderName: r.leader?.name ?? null,
        createdAt: r.createdAt?.toISOString(),
        updatedAt: r.updatedAt?.toISOString(),
      })));
    }
    if (table === "AllocationSourceConfig") {
      const rows = await prisma.allocationSourceConfig.findMany({ orderBy: { sortOrder: "asc" } });
      return NextResponse.json(rows.map((r) => ({
        id: r.id,
        sourceCode: r.sourceCode,
        label: r.label,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        defaultDays: r.defaultDays,
        note: r.note,
        updatedAt: r.updatedAt?.toISOString(),
      })));
    }
    if (table === "SchedulerJobType") {
      const rows = await prisma.schedulerJobType.findMany({ orderBy: { sortOrder: "asc" } });
      return NextResponse.json(rows.map((r) => ({
        id: r.id,
        jobKey: r.jobKey,
        name: r.name,
        description: r.description,
        sortOrder: r.sortOrder,
        isActive: r.isActive,
        updatedAt: r.updatedAt?.toISOString(),
      })));
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "조회 실패" }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown table" }, { status: 400 });
}

/** ADMIN만. 테이블별 1건 수정. */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "ADMIN만 수정 가능합니다." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { table: string; id?: string; key?: string; data: Record<string, unknown> };
  const { table, id, key, data } = body;
  const allowed = ["SystemConfig", "Team", "AllocationSourceConfig", "SchedulerJobType"];
  if (!table || !allowed.includes(table) || !data || typeof data !== "object") {
    return NextResponse.json({ error: "table 및 data가 필요합니다." }, { status: 400 });
  }

  try {
    if (table === "SystemConfig") {
      const k = (key ?? data.key) as string;
      const value = typeof data.value === "string" ? data.value : JSON.stringify(data.value);
      if (!k) return NextResponse.json({ error: "key 필요" }, { status: 400 });
      await prisma.systemConfig.upsert({
        where: { key: k },
        create: { key: k, value },
        update: { value },
      });
      return NextResponse.json({ ok: true });
    }
    if (table === "Team") {
      if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
      const update: { name?: string; sortOrder?: number; leaderId?: string | null } = {};
      if (typeof data.name === "string") update.name = data.name;
      if (typeof data.sortOrder === "number") update.sortOrder = data.sortOrder;
      if (data.leaderId === null || data.leaderId === "") update.leaderId = null;
      else if (typeof data.leaderId === "string") update.leaderId = data.leaderId;
      await prisma.team.update({ where: { id }, data: update });
      return NextResponse.json({ ok: true });
    }
    if (table === "AllocationSourceConfig") {
      if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
      const update: { label?: string; sortOrder?: number; isActive?: boolean; defaultDays?: number | null; note?: string | null } = {};
      if (typeof data.label === "string") update.label = data.label;
      if (typeof data.sortOrder === "number") update.sortOrder = data.sortOrder;
      if (typeof data.isActive === "boolean") update.isActive = data.isActive;
      if (data.defaultDays === null) update.defaultDays = null;
      else if (typeof data.defaultDays === "number") update.defaultDays = data.defaultDays;
      if (data.note !== undefined) update.note = data.note === "" ? null : String(data.note);
      await prisma.allocationSourceConfig.update({ where: { id }, data: update });
      return NextResponse.json({ ok: true });
    }
    if (table === "SchedulerJobType") {
      if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
      const update: { name?: string; description?: string | null; sortOrder?: number; isActive?: boolean } = {};
      if (typeof data.name === "string") update.name = data.name;
      if (data.description !== undefined) update.description = data.description === "" ? null : String(data.description);
      if (typeof data.sortOrder === "number") update.sortOrder = data.sortOrder;
      if (typeof data.isActive === "boolean") update.isActive = data.isActive;
      await prisma.schedulerJobType.update({ where: { id }, data: update });
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown table" }, { status: 400 });
}

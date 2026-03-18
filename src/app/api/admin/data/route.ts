import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

/** 조회 가능 테이블: id(API용), label(화면표시), editable(수정 가능 여부) */
const DATA_TABLE_OPTIONS = [
  { id: "SystemConfig", label: "시스템 설정 (키-값)", editable: true },
  { id: "Team", label: "팀", editable: true },
  { id: "AllocationSourceConfig", label: "귀속연도 부여 구분", editable: true },
  { id: "SchedulerJobType", label: "스케줄러 유형", editable: true },
  { id: "Employee", label: "사원", editable: false },
  { id: "User", label: "사용자 계정", editable: false },
  { id: "Notice", label: "공지사항", editable: false },
  { id: "Form", label: "유동 양식", editable: false },
  { id: "JejuAccommodation", label: "제주 숙소 신청", editable: false },
  { id: "LeaveRequest", label: "휴가 신청", editable: false },
  { id: "LeaveType", label: "휴가 유형", editable: false },
  { id: "LeaveAllocation", label: "휴가 할당", editable: false },
  { id: "AuditLog", label: "감사 로그", editable: false },
  { id: "SchedulerLog", label: "스케줄러 실행 이력", editable: false },
  { id: "NotificationLog", label: "알림 발송 로그", editable: false },
  { id: "InviteToken", label: "초대 토큰", editable: false },
  { id: "FormSubmission", label: "양식 제출", editable: false },
  { id: "RequestLog", label: "요청(접속) 로그", editable: false },
] as const;

const EDITABLE_TABLES = DATA_TABLE_OPTIONS.filter((t) => t.editable).map((t) => t.id);
const ALL_TABLE_IDS = DATA_TABLE_OPTIONS.map((t) => t.id);

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out;
}

/** ADMIN만. 테이블별 목록 조회. ?table=... &page=1&pageSize=50 (선택) */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "ADMIN만 조회 가능합니다." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const table = searchParams.get("table");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50));

  if (!table || !(ALL_TABLE_IDS as readonly string[]).includes(table)) {
    return NextResponse.json({ error: "table 파라미터가 없거나 허용된 테이블이 아닙니다." }, { status: 400 });
  }

  const usePagination = searchParams.has("page") || searchParams.has("pageSize");

  try {
    // 기존 4개 테이블 + 페이지 없음 → 기존 형식(배열) 유지
    if (!usePagination && (EDITABLE_TABLES as readonly string[]).includes(table)) {
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
    }

    // 페이지네이션 또는 읽기전용 테이블
    const skip = (page - 1) * pageSize;

    if (table === "SystemConfig") {
      const [rows, total] = await Promise.all([
        prisma.systemConfig.findMany({ orderBy: { key: "asc" }, skip, take: pageSize }),
        prisma.systemConfig.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow({ key: r.key, value: r.value, updatedAt: r.updatedAt })), total });
    }
    if (table === "Team") {
      const [rows, total] = await Promise.all([
        prisma.team.findMany({
          include: { leader: { select: { id: true, name: true, empNo: true } } },
          orderBy: { sortOrder: "asc" },
          skip,
          take: pageSize,
        }),
        prisma.team.count(),
      ]);
      return NextResponse.json({
        rows: rows.map((r) => serializeRow({
          id: r.id,
          name: r.name,
          sortOrder: r.sortOrder,
          leaderId: r.leaderId,
          leaderName: r.leader?.name ?? null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
        total,
      });
    }
    if (table === "AllocationSourceConfig") {
      const [rows, total] = await Promise.all([
        prisma.allocationSourceConfig.findMany({ orderBy: { sortOrder: "asc" }, skip, take: pageSize }),
        prisma.allocationSourceConfig.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "SchedulerJobType") {
      const [rows, total] = await Promise.all([
        prisma.schedulerJobType.findMany({ orderBy: { sortOrder: "asc" }, skip, take: pageSize }),
        prisma.schedulerJobType.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "Employee") {
      const [rows, total] = await Promise.all([
        prisma.employee.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.employee.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "User") {
      const [rows, total] = await Promise.all([
        prisma.user.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.user.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "Notice") {
      const [rows, total] = await Promise.all([
        prisma.notice.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.notice.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "Form") {
      const [rows, total] = await Promise.all([
        prisma.form.findMany({ orderBy: { updatedAt: "desc" }, skip, take: pageSize }),
        prisma.form.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "JejuAccommodation") {
      const [rows, total] = await Promise.all([
        prisma.jejuAccommodation.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.jejuAccommodation.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "LeaveRequest") {
      const [rows, total] = await Promise.all([
        prisma.leaveRequest.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.leaveRequest.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "LeaveType") {
      const [rows, total] = await Promise.all([
        prisma.leaveType.findMany({ orderBy: { sortOrder: "asc" }, skip, take: pageSize }),
        prisma.leaveType.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "LeaveAllocation") {
      const [rows, total] = await Promise.all([
        prisma.leaveAllocation.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.leaveAllocation.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "AuditLog") {
      const [rows, total] = await Promise.all([
        prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.auditLog.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "SchedulerLog") {
      const [rows, total] = await Promise.all([
        prisma.schedulerLog.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.schedulerLog.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "NotificationLog") {
      const [rows, total] = await Promise.all([
        prisma.notificationLog.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.notificationLog.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "InviteToken") {
      const [rows, total] = await Promise.all([
        prisma.inviteToken.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.inviteToken.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "FormSubmission") {
      const [rows, total] = await Promise.all([
        prisma.formSubmission.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.formSubmission.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
    }
    if (table === "RequestLog") {
      const [rows, total] = await Promise.all([
        prisma.requestLog.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
        prisma.requestLog.count(),
      ]);
      return NextResponse.json({ rows: rows.map((r) => serializeRow(r as unknown as Record<string, unknown>)), total });
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

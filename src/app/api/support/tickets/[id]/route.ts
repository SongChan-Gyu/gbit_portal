import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getInternalEmployeeForApi } from "@/lib/requireInternalEmployee";
import { isPmOrAdmin } from "@/lib/internalRoles";

function canAccessTicket(
  ticket: { employeeId: string },
  employee: { id: string; role: string },
) {
  return ticket.employeeId === employee.id || isPmOrAdmin(employee.role);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await getInternalEmployeeForApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
    },
  });
  if (!ticket) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });
  if (!canAccessTicket(ticket, gate.employee)) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
  }

  return NextResponse.json({
    ticket,
    isStaff: isPmOrAdmin(gate.employee.role),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await getInternalEmployeeForApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });
  if (!canAccessTicket(ticket, gate.employee)) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const status = String(body.status ?? "").toUpperCase();
  if (status !== "CLOSED" && status !== "OPEN") {
    return NextResponse.json({ error: "status는 OPEN 또는 CLOSED여야 합니다." }, { status: 400 });
  }

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json({ ok: true, ticket: updated });
}

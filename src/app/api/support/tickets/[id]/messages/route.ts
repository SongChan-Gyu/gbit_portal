import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getInternalEmployeeForApi } from "@/lib/requireInternalEmployee";
import { isPmOrAdmin } from "@/lib/internalRoles";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await getInternalEmployeeForApi();
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });

  if (ticket.status === "CLOSED") {
    return NextResponse.json({ error: "종료된 문의에는 메시지를 추가할 수 없습니다." }, { status: 400 });
  }

  const isOwner = ticket.employeeId === gate.employee.id;
  const staff = isPmOrAdmin(gate.employee.role);
  if (!isOwner && !staff) {
    return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (text.length < 1) {
    return NextResponse.json({ error: "내용을 입력해 주세요." }, { status: 400 });
  }

  const isStaffMessage = staff && ticket.employeeId !== gate.employee.id;

  await prisma.$transaction([
    prisma.supportTicketMessage.create({
      data: {
        ticketId: id,
        authorId: gate.employee.id,
        body: text.slice(0, 50_000),
        isStaffReply: isStaffMessage,
      },
    }),
    prisma.supportTicket.update({
      where: { id },
      data: { updatedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}

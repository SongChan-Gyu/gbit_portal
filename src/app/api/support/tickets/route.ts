import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getInternalEmployeeForApi } from "@/lib/requireInternalEmployee";
import { isPmOrAdmin } from "@/lib/internalRoles";

export async function GET() {
  const gate = await getInternalEmployeeForApi();
  if (!gate.ok) return gate.response;

  const staff = isPmOrAdmin(gate.employee.role);
  const tickets = await prisma.supportTicket.findMany({
    where: staff ? {} : { employeeId: gate.employee.id },
    include: {
      employee: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, body: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 150,
  });

  return NextResponse.json({ tickets, isStaffView: staff });
}

export async function POST(req: Request) {
  const gate = await getInternalEmployeeForApi();
  if (!gate.ok) return gate.response;

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (subject.length < 2) {
    return NextResponse.json({ error: "제목을 2자 이상 입력해 주세요." }, { status: 400 });
  }
  if (text.length < 1) {
    return NextResponse.json({ error: "문의 내용을 입력해 주세요." }, { status: 400 });
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.supportTicket.create({
      data: {
        employeeId: gate.employee.id,
        subject: subject.slice(0, 200),
        status: "OPEN",
      },
    });
    await tx.supportTicketMessage.create({
      data: {
        ticketId: t.id,
        authorId: gate.employee.id,
        body: text.slice(0, 50_000),
        isStaffReply: false,
      },
    });
    return t;
  });

  return NextResponse.json({ ok: true, id: ticket.id });
}

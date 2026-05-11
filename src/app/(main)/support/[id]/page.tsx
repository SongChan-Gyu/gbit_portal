import { notFound } from "next/navigation";
import { requireInternalPageSession } from "@/lib/internalPageGuard";
import prisma from "@/lib/db";
import { isPmOrAdmin } from "@/lib/internalRoles";
import SupportDetailClient from "./SupportDetailClient";

export default async function SupportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { employee } = await requireInternalPageSession();
  const { id } = await params;

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
  if (!ticket) notFound();

  const staff = isPmOrAdmin(employee.role);
  if (ticket.employeeId !== employee.id && !staff) notFound();

  return (
    <SupportDetailClient
      initialTicket={JSON.parse(JSON.stringify(ticket))}
      viewer={{ id: employee.id, role: employee.role }}
    />
  );
}

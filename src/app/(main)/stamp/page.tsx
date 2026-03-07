import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import StampClient from "./StampClient";
import { serializeDates } from "@/lib/serialize";

export default async function StampPage() {
  const session = await auth();
  const user = session!.user as any;

  const [stamps, stampRequests, employee, healingLogs] = await Promise.all([
    prisma.stampCoupon.findMany({
      where: { employeeId: user.employeeId },
      orderBy: { stampDate: "asc" },
    }),
    prisma.stampRequest.findMany({
      where: { employeeId: user.employeeId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.employee.findUnique({ where: { id: user.employeeId }, include: { team: true } }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId: user.employeeId,
        items: { some: { leaveType: { code: "HEALING_DAY" } } },
        status: { not: "CANCELLED" },
      },
      orderBy: { startDate: "desc" },
      take: 5,
    }),
  ]);

  return (
    <StampClient
      stamps={serializeDates(stamps) as any}
      stampRequests={serializeDates(stampRequests) as any}
      employee={serializeDates(employee) as any}
      healingLogs={serializeDates(healingLogs) as any}
      employeeId={user.employeeId}
    />
  );
}

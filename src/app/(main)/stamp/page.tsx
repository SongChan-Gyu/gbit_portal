import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import StampClient from "./StampClient";
import { serializeDates } from "@/lib/serialize";
import { countAfternoonEligible, countHealingEligible } from "@/lib/stampCard";
import { redirect } from "next/navigation";

export default async function StampPage() {
  const session = await auth();
  const user = session!.user as any;

  const self = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { employeeType: true },
  });
  if (self?.employeeType === "EXTERNAL") redirect("/dashboard");

  const [stampCards, stampRequests, employee, healingLogs, healingAvail, afternoonAvail, totalStamps] =
    await Promise.all([
      prisma.stampCard.findMany({
        where: { employeeId: user.employeeId },
        orderBy: { sortOrder: "asc" },
        include: { stamps: { orderBy: { stampDate: "asc" } } },
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
      countHealingEligible(prisma, user.employeeId),
      countAfternoonEligible(prisma, user.employeeId),
      prisma.stampCoupon.count({ where: { employeeId: user.employeeId } }),
    ]);

  return (
    <StampClient
      stampCards={serializeDates(stampCards) as any}
      stampRequests={serializeDates(stampRequests) as any}
      employee={serializeDates(employee) as any}
      healingLogs={serializeDates(healingLogs) as any}
      healingAvail={healingAvail}
      afternoonAvail={afternoonAvail}
      totalStamps={totalStamps}
    />
  );
}

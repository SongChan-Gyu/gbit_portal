import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getActiveLoginAnnouncementForEmployee } from "@/lib/loginAnnouncements";

export async function GET() {
  const session = await auth();
  const u = session?.user as { employeeId?: string } | undefined;
  if (!u?.employeeId) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const emp = await prisma.employee.findUnique({
    where: { id: u.employeeId },
    select: { employeeType: true },
  });

  const item = await getActiveLoginAnnouncementForEmployee(
    prisma,
    u.employeeId,
    emp?.employeeType,
  );
  return NextResponse.json(item);
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requireSettingsAccess } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { serializeDates } from "@/lib/serialize";

export async function GET(req: NextRequest) {
  const session = await auth();
  const u = session?.user as { role?: string } | undefined;
  const guard = requireSettingsAccess(u); if (guard) return guard;

  const empId = new URL(req.url).searchParams.get("empId");
  if (!empId) return NextResponse.json({ allocations: [] });

  const allocations = await prisma.leaveAllocation.findMany({
    where: { employeeId: empId },
    include: { employee: { select: { name: true, empNo: true } } },
    orderBy: [{ isActive:"desc" }, { fiscalYear:"desc" }, { sourceCode:"asc" }],
  });
  return NextResponse.json({ allocations: serializeDates(allocations) });
}

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u); if (guard) return guard;

  const body = await req.json();
  const { employeeId, sourceCode, label, totalDays, usedDays, validFrom, validUntil, fiscalYear, note } = body;
  if (!employeeId||!sourceCode||!label||!totalDays||!validFrom||!validUntil)
    return NextResponse.json({ error:"필수 항목 누락" }, { status:400 });

  const alloc = await prisma.leaveAllocation.create({
    data:{
      employeeId, sourceCode, label,
      totalDays: parseFloat(totalDays),
      usedDays: parseFloat(usedDays ?? 0),
      validFrom: new Date(validFrom),
      validUntil: new Date(validUntil),
      fiscalYear: fiscalYear ?? null,
      note: note ?? null,
      grantedById: u.employeeId,
    },
  });
  await prisma.auditLog.create({
    data:{ entityType:"LeaveAllocation", entityId:alloc.id, action:"GRANTED",
      actorId:u.employeeId, after:JSON.stringify({ label, totalDays, validFrom, validUntil }) },
  });
  return NextResponse.json({ ok:true, id:alloc.id });
}

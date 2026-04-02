import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { deriveLegacyHalfFlags } from "@/lib/leaveTimeSlot";

export async function PATCH(req: Request, { params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const session = await auth();
  const u = session?.user as any;
  if (!["PM","ADMIN"].includes(u?.role ?? "")) return NextResponse.json({ error:"권한 없음" }, { status:403 });

  const body = await req.json();
  let allowsFullDay = body.allowsFullDay as boolean | undefined;
  let allowsHalfDay = body.allowsHalfDay as boolean | undefined;
  const halfDayRaw = body.halfDayAmPm as string | undefined;
  const halfDayAmPm = ["AM_ONLY", "PM_ONLY", "BOTH"].includes(halfDayRaw ?? "")
    ? halfDayRaw!
    : undefined;

  if (typeof allowsFullDay !== "boolean" || typeof allowsHalfDay !== "boolean") {
    allowsFullDay = !(body.isHalf ?? false);
    allowsHalfDay = !!(body.isHalf ?? false);
  }
  const hd = halfDayAmPm ?? "BOTH";
  const legacy = deriveLegacyHalfFlags({
    allowsFullDay: allowsFullDay!,
    allowsHalfDay: allowsHalfDay!,
    halfDayAmPm: hd,
  });

  const data: Prisma.LeaveTypeUpdateInput = {
    name:body.name, daysPerUnit:body.daysPerUnit, deductFromBalance:body.deductFromBalance,
    approvalSteps:body.approvalSteps, maxPerMonth:body.maxPerMonth??null, maxPerYear:body.maxPerYear??null,
    requiresStamp:body.requiresStamp, stampCount:body.stampCount??null,
    allowsFullDay, allowsHalfDay, halfDayAmPm: hd,
    includeInFiscalInit: body.includeInFiscalInit ?? undefined,
    carryoverEligible: body.carryoverEligible ?? undefined,
    autoCarryoverOnFiscalInit: body.autoCarryoverOnFiscalInit ?? undefined,
    isHalf: legacy.isHalf, isAmOnly: legacy.isAmOnly, isPmOnly: legacy.isPmOnly,
    validityBasis:body.validityBasis, validityMonths:body.validityMonths??null,
    isActive:body.isActive, sortOrder:body.sortOrder, color:body.color,
  };
  if ("usageCategory" in body) {
    data.usageCategory = body.usageCategory === "REASON" ? "REASON" : "ASSET";
  }
  if ("displayHint" in body) {
    data.displayHint =
      typeof body.displayHint === "string" && body.displayHint.trim()
        ? body.displayHint.trim()
        : null;
  }
  if ("allocationSourceCode" in body) {
    data.allocationSourceCode =
      typeof body.allocationSourceCode === "string" && body.allocationSourceCode.trim()
        ? body.allocationSourceCode.trim()
        : null;
  }
  if ("applyGroupKey" in body) {
    data.applyGroupKey =
      typeof body.applyGroupKey === "string" && body.applyGroupKey.trim()
        ? body.applyGroupKey.trim()
        : null;
  }
  const updated = await prisma.leaveType.update({ where:{ id }, data });
  if (updated.allocationSourceCode && updated.validityBasis === "귀속연도") {
    const defaultDays =
      updated.maxPerYear != null ? Number(updated.maxPerYear) : Number(updated.daysPerUnit ?? 1);
    await prisma.allocationSourceConfig.upsert({
      where: { sourceCode: updated.allocationSourceCode },
      update: {
        label: updated.name,
        defaultDays: Number.isFinite(defaultDays) ? defaultDays : null,
        isActive: true,
      },
      create: {
        sourceCode: updated.allocationSourceCode,
        label: updated.name,
        defaultDays: Number.isFinite(defaultDays) ? defaultDays : null,
        isActive: true,
      },
    });
  }
  return NextResponse.json({ ok:true });
}

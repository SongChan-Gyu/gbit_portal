import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { deriveLegacyHalfFlags } from "@/lib/leaveTimeSlot";

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requirePMOrAdmin(u); if (guard) return guard;

  const body = await req.json();
  if (!body.code || !body.name) return NextResponse.json({ error:"코드/이름 필수" }, { status:400 });

  const dup = await prisma.leaveType.findUnique({ where:{code:body.code} });
  if (dup) return NextResponse.json({ error:"이미 존재하는 코드입니다." }, { status:400 });

  const allocSrc =
    typeof body.allocationSourceCode === "string" && body.allocationSourceCode.trim()
      ? body.allocationSourceCode.trim()
      : null;

  const allowsFullDay =
    typeof body.allowsFullDay === "boolean" ? body.allowsFullDay : !(body.isHalf ?? false);
  const allowsHalfDay =
    typeof body.allowsHalfDay === "boolean" ? body.allowsHalfDay : !!(body.isHalf ?? false);
  const halfDayRaw = typeof body.halfDayAmPm === "string" ? body.halfDayAmPm : "BOTH";
  const halfDayAmPm = ["AM_ONLY", "PM_ONLY", "BOTH"].includes(halfDayRaw) ? halfDayRaw : "BOTH";
  const applyGroupKey =
    typeof body.applyGroupKey === "string" && body.applyGroupKey.trim()
      ? body.applyGroupKey.trim()
      : null;
  const usageCategory = body.usageCategory === "REASON" ? "REASON" : "ASSET";
  const displayHint =
    typeof body.displayHint === "string" && body.displayHint.trim()
      ? body.displayHint.trim()
      : null;
  const legacy = deriveLegacyHalfFlags({ allowsFullDay, allowsHalfDay, halfDayAmPm });

  const lt = await prisma.leaveType.create({
    data:{
      code:body.code, name:body.name, daysPerUnit:body.daysPerUnit??1,
      deductFromBalance:body.deductFromBalance??true,
      approvalSteps: body.approvalSteps === 0 ? 0 : 1,
      maxPerMonth:body.maxPerMonth??null, maxPerYear:body.maxPerYear??null,
      requiresStamp:body.requiresStamp??false, stampCount:body.stampCount??null,
      allowsFullDay, allowsHalfDay, halfDayAmPm,
      applyGroupKey,
      usageCategory,
      displayHint,
      includeInFiscalInit: body.includeInFiscalInit ?? true,
      carryoverEligible: body.carryoverEligible ?? false,
      autoCarryoverOnFiscalInit: body.autoCarryoverOnFiscalInit ?? false,
      isHalf: legacy.isHalf, isAmOnly: legacy.isAmOnly, isPmOnly: legacy.isPmOnly,
      validityBasis:body.validityBasis??"FISCAL", validityMonths:body.validityMonths??null,
      isActive:body.isActive??true, sortOrder:body.sortOrder??99, color:body.color??"#3b82f6",
      allocationSourceCode: allocSrc,
    },
  });
  if (allocSrc && (body.validityBasis ?? "FISCAL") === "귀속연도") {
    const defaultDays =
      body.maxPerYear != null ? Number(body.maxPerYear) : Number(body.daysPerUnit ?? 1);
    await prisma.allocationSourceConfig.upsert({
      where: { sourceCode: allocSrc },
      update: {
        label: body.name,
        defaultDays: Number.isFinite(defaultDays) ? defaultDays : null,
        isActive: true,
      },
      create: {
        sourceCode: allocSrc,
        label: body.name,
        defaultDays: Number.isFinite(defaultDays) ? defaultDays : null,
        isActive: true,
      },
    });
  }
  return NextResponse.json({ ok:true, id:lt.id });
}

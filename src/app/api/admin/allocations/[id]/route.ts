import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    const u = session?.user as any;
    const guard = requirePMOrAdmin(u); if (guard) return guard;

    const prev = await prisma.leaveAllocation.findUnique({ where: { id } });
    if (!prev) return NextResponse.json({ error: "해당 할당을 찾을 수 없습니다." }, { status: 404 });

    if (Number(prev.usedDays) > 1e-6) {
      return NextResponse.json(
        { error: `사용 일수(${prev.usedDays}일)가 있어 삭제할 수 없습니다. 관련 휴가를 취소한 후 삭제하거나 비활성화를 사용하세요.` },
        { status: 400 },
      );
    }

    await prisma.leaveAllocation.delete({ where: { id } });

    await writeAudit({
      entityType: "LeaveAllocation",
      entityId: id,
      action: "DELETED" as any,
      actorId: u.employeeId,
      before: prev,
      note: `관리자 삭제 — ${prev.label} (${prev.sourceCode})`,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[allocations DELETE]", e);
    return NextResponse.json({ error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id:string }> }) {
  try {
    const { id } = await params;
    const session = await auth();
    const u = session?.user as any;
    const guard = requirePMOrAdmin(u); if (guard) return guard;

    const body = await req.json();
    const prev = await prisma.leaveAllocation.findUnique({ where:{ id } });
    if (!prev) return NextResponse.json({ error:"해당 할당을 찾을 수 없습니다." }, { status:404 });

    const totalDays = body.totalDays != null ? parseFloat(body.totalDays) : prev.totalDays;
    const usedDays  = body.usedDays  != null ? parseFloat(body.usedDays)  : prev.usedDays;
    if (Number.isNaN(totalDays) || Number.isNaN(usedDays)) {
      return NextResponse.json({ error: "부여일수/사용일수는 숫자여야 합니다." }, { status: 400 });
    }
    const remaining = totalDays - usedDays;
    if (remaining < -0.001) {
      return NextResponse.json({
        error: "잔여일수가 마이너스가 될 수 없습니다. 관련 승인 휴가를 먼저 취소한 후 수정해 주세요.",
      }, { status:400 });
    }

    const action = body.isActive === false && prev?.isActive === true ? "DEACTIVATED"
                 : body.isActive === true && prev?.isActive === false ? "RESTORED"
                 : "UPDATED";

    const updated = await prisma.leaveAllocation.update({
      where:{ id },
      data:{
        sourceCode:  body.sourceCode  ?? prev?.sourceCode,
        label:       body.label       ?? prev?.label,
        totalDays,
        usedDays,
        validFrom:   body.validFrom  ? new Date(body.validFrom)  : prev?.validFrom,
        validUntil:  body.validUntil ? new Date(body.validUntil) : prev?.validUntil,
        note:        body.note ?? prev?.note ?? null,
        isActive:    body.isActive != null ? body.isActive : prev?.isActive,
      },
    });

    await writeAudit({
    entityType: "LeaveAllocation", entityId: id,
    action: action as any, actorId: u.employeeId,
    before: prev, after: updated,
    note: body.adminNote ?? `관리자 수정`,
  });
  return NextResponse.json({ ok: true, data: updated });
  } catch (e) {
    console.error("[allocations PATCH]", e);
    return NextResponse.json(
      { error: "수정 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}

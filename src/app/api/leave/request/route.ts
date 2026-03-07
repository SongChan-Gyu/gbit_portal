import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getFiscalYear } from "@/lib/workdays";
import { sendLeaveRequestAlimtalk } from "@/lib/kakao";

/** 연차 = 기본연차 + 근속가산 + 이월연차만. 특별휴가(근속1/5/10년)·부서추가는 별도 풀 */
const ANNUAL_ONLY_SOURCES = [
  "CARRYOVER",     // 이월연차 (만료 임박 순으로 먼저 차감)
  "TENURE_BONUS",  // 근속가산
  "BASE_ANNUAL",   // 기본연차
];
/** 돌봄휴가 전용 풀 (연 2일) */
const CARE_POOL_SOURCE = "CARE";
const CARE_TYPE_CODES = new Set(["CARE", "CARE_AM", "CARE_PM"]);
/** 연휴연장휴가 전용 풀 (귀속연도당 1일, 1일 단위만 사용) */
const HOLIDAY_EXT_POOL_SOURCE = "HOLIDAY_EXT";
const HOLIDAY_EXT_TYPE_CODES = new Set(["HOLIDAY_EXT"]);
/** 생일반차 전용 풀 (스케줄러가 해당 월에 0.5일 부여) */
const BIRTHDAY_HALF_POOL_SOURCE = "BIRTHDAY_HALF";
const BIRTHDAY_HALF_TYPE_CODES = new Set(["BIRTHDAY_HALF"]);

export async function POST(req: Request) {
  try {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const user = session.user as any;

  const { items } = await req.json() as {
    items: { leaveTypeId: string; allocationId: string; startDate: string; endDate: string; days: number; reason?: string }[];
  };

  if (!items?.length) return NextResponse.json({ error: "신청 항목이 없습니다." }, { status: 400 });

  const ltIds = [...new Set(items.map((i) => i.leaveTypeId))];
  const leaveTypes = await prisma.leaveType.findMany({ where: { id: { in: ltIds } } });
  const ltMap = Object.fromEntries(leaveTypes.map((t) => [t.id, t]));

  const allDates = items.flatMap((i) => [new Date(i.startDate), new Date(i.endDate)]);
  const startDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const endDate   = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const totalDays = items.reduce((s, i) => s + i.days, 0);
  const fy = getFiscalYear(startDate);
  const now = new Date();

  // ── 연차 풀 (기본+근속가산+이월만, 특별휴가/부서추가 제외) ──
  const poolAllocs = await prisma.leaveAllocation.findMany({
    where: {
      employeeId: user.employeeId,
      sourceCode: { in: ANNUAL_ONLY_SOURCES },
      isActive: true,
      validFrom:  { lte: now },
      validUntil: { gte: now },
    },
  });
  poolAllocs.sort((a, b) => {
    const ai = ANNUAL_ONLY_SOURCES.indexOf(a.sourceCode);
    const bi = ANNUAL_ONLY_SOURCES.indexOf(b.sourceCode);
    if (ai !== bi) return ai - bi;
    return new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime();
  });

  const totalPoolRemaining = poolAllocs.reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0);

  // ── 돌봄휴가 풀 (CARE/CARE_AM/CARE_PM 사용 시 이 할당에서 차감) ──
  const careAllocs = await prisma.leaveAllocation.findMany({
    where: {
      employeeId: user.employeeId,
      sourceCode: CARE_POOL_SOURCE,
      isActive: true,
      validFrom: { lte: now },
      validUntil: { gte: now },
    },
  });
  const carePoolRemaining = careAllocs.reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0);

  // ── 연휴연장휴가 풀 (1일만 사용, 반차 불가)
  const holidayExtAllocs = await prisma.leaveAllocation.findMany({
    where: {
      employeeId: user.employeeId,
      sourceCode: HOLIDAY_EXT_POOL_SOURCE,
      isActive: true,
      validFrom: { lte: now },
      validUntil: { gte: now },
    },
  });
  const holidayExtPoolRemaining = holidayExtAllocs.reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0);

  // ── 생일반차 풀 (스케줄러가 해당 월 0.5일 부여)
  const birthdayHalfAllocs = await prisma.leaveAllocation.findMany({
    where: {
      employeeId: user.employeeId,
      sourceCode: BIRTHDAY_HALF_POOL_SOURCE,
      isActive: true,
      validFrom: { lte: now },
      validUntil: { gte: now },
    },
  });
  const birthdayHalfPoolRemaining = birthdayHalfAllocs.reduce((s, a) => s + Math.max(0, a.totalDays - a.usedDays), 0);

  // ── 휴일·주말 포함 여부 검증 (선택 기간에 공휴일/주말이 있으면 신청 불가) ──
  const startOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
  const rangeHolidays = await prisma.holiday.findMany({
    where: { date: { gte: startOnly, lte: endOnly } },
  });
  const holidaySet = new Set(rangeHolidays.map((h) => h.date.toISOString().slice(0, 10)));
  const invalidDays: string[] = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  while (cur <= end) {
    const ds = toYmd(cur);
    const dow = cur.getDay();
    if (dow === 0 || dow === 6 || holidaySet.has(ds)) invalidDays.push(ds);
    cur.setDate(cur.getDate() + 1);
  }
  if (invalidDays.length > 0) {
    return NextResponse.json(
      { error: `선택한 기간에 공휴일 또는 주말이 포함되어 있습니다. (${invalidDays.slice(0, 5).join(", ")}${invalidDays.length > 5 ? " 외 " + (invalidDays.length - 5) + "일" : ""})` },
      { status: 400 }
    );
  }

  // ── 같은 기간 중복 신청 방지 (승인/대기 중인 휴가와 기간 겹침 불가) ──
  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: user.employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      OR: [
        { startDate: { lte: endDate }, endDate: { gte: startDate } },
      ],
    },
  });
  if (overlapping) {
    return NextResponse.json(
      { error: `해당 기간에 이미 휴가가 신청/승인되어 있습니다. (${overlapping.startDate.toISOString().slice(0, 10)} ~ ${overlapping.endDate.toISOString().slice(0, 10)})` },
      { status: 400 }
    );
  }

  // ── 검증 ──
  for (const it of items) {
    const lt = ltMap[it.leaveTypeId];
    if (!lt?.isActive) return NextResponse.json({ error: `유효하지 않은 휴가 유형: ${lt?.name}` }, { status: 400 });

    if (lt.requiresStamp && lt.stampCount) {
      const avail = await prisma.stampCoupon.count({ where: { employeeId: user.employeeId, isUsed: false } });
      if (avail < lt.stampCount)
        return NextResponse.json({ error: `${lt.name}: 스탬프 ${lt.stampCount}개 필요 (현재 ${avail}개)` }, { status: 400 });
    }

    if (lt.maxPerMonth) {
      const s = new Date(it.startDate);
      const cnt = await prisma.leaveRequestItem.count({
        where: {
          leaveTypeId: lt.id,
          leaveRequest: {
            employeeId: user.employeeId, status: { not: "CANCELLED" },
            startDate: { gte: new Date(s.getFullYear(), s.getMonth(), 1), lt: new Date(s.getFullYear(), s.getMonth() + 1, 1) },
          },
        },
      });
      if (cnt >= lt.maxPerMonth)
        return NextResponse.json({ error: `${lt.name}은 이번 달 최대 사용 횟수를 초과했습니다.` }, { status: 400 });
    }

    // 연차 차감 유형: 풀 총량 검증
    if (lt.deductFromBalance) {
      const days = lt.isHalf ? 0.5 : it.days;
      if (totalPoolRemaining < days)
        return NextResponse.json({
          error: `잔여 연차 부족 (잔여 ${totalPoolRemaining.toFixed(1)}일, 신청 ${days}일)`,
        }, { status: 400 });
    }
  }
  // 돌봄휴가: 이번 신청 합계가 돌봄 풀 잔여 이하여야 함
  const careDaysRequested = items.reduce((sum, it) => {
    const lt = ltMap[it.leaveTypeId];
    if (lt && CARE_TYPE_CODES.has(lt.code)) return sum + (lt.isHalf ? 0.5 : it.days);
    return sum;
  }, 0);
  if (careDaysRequested > 0 && careDaysRequested > carePoolRemaining) {
    return NextResponse.json({
      error: `돌봄휴가 잔여 부족 (연 2일 한도, 잔여 ${carePoolRemaining.toFixed(1)}일, 신청 ${careDaysRequested.toFixed(1)}일)`,
    }, { status: 400 });
  }
  // 연휴연장휴가: 1일만 사용 가능, 풀 잔여 이하여야 함
  const holidayExtDaysRequested = items.reduce((sum, it) => {
    const lt = ltMap[it.leaveTypeId];
    if (lt && HOLIDAY_EXT_TYPE_CODES.has(lt.code)) return sum + (it.days || 1);
    return sum;
  }, 0);
  if (holidayExtDaysRequested > 0 && holidayExtDaysRequested > holidayExtPoolRemaining) {
    return NextResponse.json({
      error: `연휴연장휴가 잔여 부족 (귀속연도 1일, 잔여 ${holidayExtPoolRemaining.toFixed(1)}일)`,
    }, { status: 400 });
  }
  const birthdayHalfDaysRequested = items.reduce((sum, it) => {
    const lt = ltMap[it.leaveTypeId];
    if (lt && BIRTHDAY_HALF_TYPE_CODES.has(lt.code)) return sum + 0.5;
    return sum;
  }, 0);
  if (birthdayHalfDaysRequested > 0 && birthdayHalfDaysRequested > birthdayHalfPoolRemaining) {
    return NextResponse.json({
      error: `생일반차 잔여 부족 (0.5일, 잔여 ${birthdayHalfPoolRemaining.toFixed(1)}일)`,
    }, { status: 400 });
  }

  // ── 결재자: 그룹(결재라인)별로 PM/ADMIN → 바로 승인, 팀장 신청 시 1단계만 있으면 바로 승인, 그 외 → 팀장/PM ──
  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: { team: { include: { leader: true } } },
  });
  const teamLeader = employee?.team?.leader;
  const pm = await prisma.employee.findFirst({ where: { role: "PM", status: "ACTIVE" } });
  const isPmOrAdmin = employee?.role === "PM" || employee?.role === "ADMIN";
  const mainReason = items[0]?.reason ?? null;

  // ── 각 항목에 대해 차감할 allocationId 자동 결정 ──
  // 연차 풀의 잔여를 추적하며 순서대로 차감
  const poolRemaining = Object.fromEntries(
    poolAllocs.map((a) => [a.id, a.totalDays - a.usedDays])
  );
  const careRemaining = Object.fromEntries(
    careAllocs.map((a) => [a.id, a.totalDays - a.usedDays])
  );
  const holidayExtRemaining = Object.fromEntries(
    holidayExtAllocs.map((a) => [a.id, a.totalDays - a.usedDays])
  );
  const birthdayHalfRemaining = Object.fromEntries(
    birthdayHalfAllocs.map((a) => [a.id, a.totalDays - a.usedDays])
  );

  function pickAllocation(days: number): string | null {
    for (const a of poolAllocs) {
      if ((poolRemaining[a.id] ?? 0) >= days) {
        poolRemaining[a.id] -= days;
        return a.id;
      }
    }
    const best = poolAllocs
      .filter((a) => (poolRemaining[a.id] ?? 0) > 0)
      .sort((a, b) => (poolRemaining[b.id] ?? 0) - (poolRemaining[a.id] ?? 0))[0];
    if (best) {
      poolRemaining[best.id] = Math.max(0, (poolRemaining[best.id] ?? 0) - days);
      return best.id;
    }
    return null;
  }

  function pickCareAllocation(days: number): string | null {
    for (const a of careAllocs) {
      if ((careRemaining[a.id] ?? 0) >= days) {
        careRemaining[a.id] -= days;
        return a.id;
      }
    }
    const best = careAllocs
      .filter((a) => (careRemaining[a.id] ?? 0) > 0)
      .sort((a, b) => (careRemaining[b.id] ?? 0) - (careRemaining[a.id] ?? 0))[0];
    if (best) {
      careRemaining[best.id] = Math.max(0, (careRemaining[best.id] ?? 0) - days);
      return best.id;
    }
    return null;
  }

  function pickHolidayExtAllocation(days: number): string | null {
    for (const a of holidayExtAllocs) {
      if ((holidayExtRemaining[a.id] ?? 0) >= days) {
        holidayExtRemaining[a.id] -= days;
        return a.id;
      }
    }
    const best = holidayExtAllocs
      .filter((a) => (holidayExtRemaining[a.id] ?? 0) > 0)
      .sort((a, b) => (holidayExtRemaining[b.id] ?? 0) - (holidayExtRemaining[a.id] ?? 0))[0];
    if (best) {
      holidayExtRemaining[best.id] = Math.max(0, (holidayExtRemaining[best.id] ?? 0) - days);
      return best.id;
    }
    return null;
  }

  function pickBirthdayHalfAllocation(days: number): string | null {
    for (const a of birthdayHalfAllocs) {
      if ((birthdayHalfRemaining[a.id] ?? 0) >= days) {
        birthdayHalfRemaining[a.id] -= days;
        return a.id;
      }
    }
    const best = birthdayHalfAllocs
      .filter((a) => (birthdayHalfRemaining[a.id] ?? 0) > 0)
      .sort((a, b) => (birthdayHalfRemaining[b.id] ?? 0) - (birthdayHalfRemaining[a.id] ?? 0))[0];
    if (best) {
      birthdayHalfRemaining[best.id] = Math.max(0, (birthdayHalfRemaining[best.id] ?? 0) - days);
      return best.id;
    }
    return null;
  }

  const resolvedItems = items.map((it) => {
    const lt = ltMap[it.leaveTypeId];
    const days = lt && HOLIDAY_EXT_TYPE_CODES.has(lt.code) ? 1 : (lt?.isHalf ? 0.5 : it.days);
    let allocationId = it.allocationId || null;
    if (lt && CARE_TYPE_CODES.has(lt.code) && !allocationId) {
      allocationId = pickCareAllocation(days);
    } else if (lt && HOLIDAY_EXT_TYPE_CODES.has(lt.code) && !allocationId) {
      allocationId = pickHolidayExtAllocation(days);
    } else if (lt && BIRTHDAY_HALF_TYPE_CODES.has(lt.code) && !allocationId) {
      allocationId = pickBirthdayHalfAllocation(days);
    } else if (lt?.deductFromBalance && !allocationId) {
      allocationId = pickAllocation(days);
    }
    return { ...it, days, allocationId };
  });

  // ── 결재라인(approvalSteps)별로 그룹화: 같은 결재라인만 한 건으로, 다르면 별도 신청으로 분리 ──
  const groupByApprovalLine = new Map<number, typeof resolvedItems>();
  for (const it of resolvedItems) {
    const steps = ltMap[it.leaveTypeId]?.approvalSteps ?? 1;
    if (!groupByApprovalLine.has(steps)) groupByApprovalLine.set(steps, []);
    groupByApprovalLine.get(steps)!.push(it);
  }

  type ResolvedItem = (typeof resolvedItems)[number];
  const createdIds: string[] = [];

  const leaveReqs = await prisma.$transaction(async (tx) => {
    const results: { id: string; totalSteps: number; isAutoApprove: boolean; approver: typeof approver; groupItems: ResolvedItem[] }[] = [];

    for (const [approvalSteps, groupItems] of groupByApprovalLine) {
      const groupStart = new Date(Math.min(...groupItems.flatMap((i) => [new Date(i.startDate).getTime(), new Date(i.endDate).getTime()])));
      const groupEnd = new Date(Math.max(...groupItems.flatMap((i) => [new Date(i.startDate).getTime(), new Date(i.endDate).getTime()])));
      const groupTotalDays = groupItems.reduce((s, i) => s + i.days, 0);
      const totalSteps = approvalSteps;
      const isGroupAutoApprove =
        isPmOrAdmin ||
        (employee?.role === "TEAM_LEAD" && totalSteps <= 1) ||
        totalSteps === 0;
      const groupApprover =
        isGroupAutoApprove
          ? null
          : (employee?.role === "TEAM_LEAD" ? pm : teamLeader) ?? pm ?? teamLeader;

      const req = await tx.leaveRequest.create({
        data: {
          employeeId: user.employeeId,
          startDate: groupStart,
          endDate: groupEnd,
          totalDays: groupTotalDays,
          reason: groupItems[0]?.reason ?? mainReason,
          status: isGroupAutoApprove ? "APPROVED" : "PENDING",
          currentStep: isGroupAutoApprove ? 0 : 1,
          totalSteps,
        },
      });
      createdIds.push(req.id);
      results.push({ id: req.id, totalSteps, isAutoApprove: isGroupAutoApprove, approver: groupApprover, groupItems });

      for (const it of groupItems) {
        await tx.leaveRequestItem.create({
          data: {
            leaveRequestId: req.id,
            leaveTypeId: it.leaveTypeId,
            allocationId: it.allocationId || null,
            days: it.days,
            startDate: new Date(it.startDate),
            endDate: new Date(it.endDate),
            reason: it.reason ?? null,
          },
        });
      }

      if (isGroupAutoApprove) {
        const reqWithItems = await tx.leaveRequest.findUnique({
          where: { id: req.id },
          include: { items: { include: { leaveType: true } } } as const,
        });
        if (reqWithItems) {
          const now = new Date();
          for (const item of reqWithItems.items) {
            let allocId = item.allocationId;
            if (!allocId) continue;
            const alloc = await tx.leaveAllocation.findUnique({ where: { id: allocId } });
            if (alloc?.sourceCode !== CARE_POOL_SOURCE && alloc?.sourceCode !== HOLIDAY_EXT_POOL_SOURCE && alloc?.sourceCode !== BIRTHDAY_HALF_POOL_SOURCE && (!alloc?.isActive || new Date(alloc.validUntil) < now)) {
              const fallback = await tx.leaveAllocation.findFirst({
                where: {
                  employeeId: user.employeeId,
                  sourceCode: { in: ANNUAL_ONLY_SOURCES },
                  isActive: true,
                  validUntil: { gte: now },
                },
                orderBy: { validUntil: "asc" },
              });
              allocId = fallback?.id ?? null;
            } else if (!alloc?.isActive) {
              allocId = null;
            }
            if (allocId) {
              await tx.leaveAllocation.update({
                where: { id: allocId },
                data: { usedDays: { increment: item.days } },
              });
            }
          }
        }
        await tx.leaveHistory.create({
          data: {
            leaveRequestId: req.id,
            action: "APPROVED",
            actorId: user.employeeId,
            snapshot: JSON.stringify({ autoApprove: true, totalDays: groupTotalDays }),
          },
        });
      } else {
        if (groupApprover)
          await tx.leaveApproval.create({ data: { leaveRequestId: req.id, approverId: groupApprover.id, step: 1, status: "PENDING" } });
        await tx.leaveHistory.create({
          data: {
            leaveRequestId: req.id,
            action: "SUBMITTED",
            actorId: user.employeeId,
            snapshot: JSON.stringify({ totalDays: groupTotalDays, items: groupItems.map((i) => ({ ...i, lt: ltMap[i.leaveTypeId]?.name })) }),
          },
        });
      }

      const groupStampUsages: { code: string; count: number }[] = [];
      for (const it of groupItems) {
        const lt = ltMap[it.leaveTypeId];
        if (lt?.requiresStamp && lt.stampCount) groupStampUsages.push({ code: lt.code, count: lt.stampCount });
      }
      for (const su of groupStampUsages) {
        const avail = await tx.stampCoupon.findMany({
          where: { employeeId: user.employeeId, isUsed: false },
          orderBy: { stampDate: "asc" },
          take: su.count,
        });
        for (const s of avail) {
          await tx.stampCoupon.update({
            where: { id: s.id },
            data: { isUsed: true, usedForType: su.code, usedAt: new Date(), usedRequestId: req.id },
          });
        }
      }
    }

    return results;
  });

  for (const r of leaveReqs) {
    if (!r.isAutoApprove && r.approver?.phone) {
      const first = r.groupItems[0];
      const last = r.groupItems[r.groupItems.length - 1];
      await sendLeaveRequestAlimtalk(prisma, r.approver!.id, r.approver!.phone,
        r.approver!.name, employee!.name,
        r.groupItems.map((i) => ltMap[i.leaveTypeId]?.name).join("+"),
        first?.startDate ?? "", last?.endDate ?? ""
      );
    }
  }

  return NextResponse.json({ ok: true, id: createdIds[0], ids: createdIds });
  } catch (e) {
    console.error("[leave/request POST]", e);
    return NextResponse.json(
      { error: "휴가 신청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}

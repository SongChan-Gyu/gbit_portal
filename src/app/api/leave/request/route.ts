import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  isWednesdayYMD,
  holidayDateToYmd,
  addDaysYMD,
  ymdRangeUtcBounds,
  allocationFullyCoversKstYmdRange,
  kstYmd,
} from "@/lib/dateUtils";
import { sendLeaveRequestAlimtalk } from "@/lib/kakao";
import { writeAudit, getIp } from "@/lib/audit";
import { countAfternoonEligible, findAfternoonStampCard } from "@/lib/stampCard";
import { leaveItemDeductDays } from "@/lib/leaveAllocationPool";
import { calcWorkingDays, getFiscalYearFromStr, listWorkingYmds, splitYmdRangeByFiscalYear } from "@/lib/workdays";
import { calcHolidayExtFullDays, isHolidayOrWeekendYmd, isValidHolidayExtDay } from "@/lib/holidayExt";
import { normalizeTimeSlotInput, type LeaveTimeSlot } from "@/lib/leaveTimeSlot";
import { ANNUAL_CORE_SOURCE_CODES, isAnnualPoolSourceCode } from "@/lib/annualPoolSource";
const PM_HALF_MONTH_CODE = "PM_HALF_MONTH";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const user = session.user as any;

    const emp = await prisma.employee.findUnique({
      where: { id: user.employeeId },
      select: { employeeType: true },
    });
    if (emp?.employeeType === "EXTERNAL")
      return NextResponse.json({ error: "외부개발자는 휴가 신청이 불가합니다." }, { status: 403 });

    const { items } = await req.json() as {
      items: {
        leaveTypeId: string;
        allocationId: string;
        startDate: string;
        endDate: string;
        days: number;
        reason?: string;
        timeSlot?: string | null;
      }[];
    };

    if (!items?.length) return NextResponse.json({ error: "신청 항목이 없습니다." }, { status: 400 });

    const ltIds = [...new Set(items.map((i) => i.leaveTypeId))];
    const leaveTypes = await prisma.leaveType.findMany({ where: { id: { in: ltIds } } });
    const ltMap = Object.fromEntries(leaveTypes.map((t) => [t.id, t]));

    /** 공휴일(영업일·연휴연장 계산용) — 신청 입력 일자 기준 */
    const itemYmdsEarly = items.flatMap((i) => [i.startDate.slice(0, 10), i.endDate.slice(0, 10)]);
    const minYmdH = itemYmdsEarly.reduce((a, b) => (a < b ? a : b));
    const maxYmdH = itemYmdsEarly.reduce((a, b) => (a > b ? a : b));
    const lookupStartYmd = addDaysYMD(minYmdH, -15);
    const lookupEndYmd = addDaysYMD(maxYmdH, 15);
    const { gte: holidayGte, lte: holidayLte } = ymdRangeUtcBounds(lookupStartYmd, lookupEndYmd);
    const rangeHolidays = await prisma.holiday.findMany({
      where: { date: { gte: holidayGte, lte: holidayLte } },
    });
    const holidaySet = new Set(rangeHolidays.map((h) => holidayDateToYmd(h.date)));
    const holidayList = Array.from(holidaySet);

    type WorkItem = {
      leaveTypeId: string;
      allocationId: string;
      startDate: string;
      endDate: string;
      days: number;
      reason?: string;
      timeSlot: LeaveTimeSlot;
    };

    const workItems: WorkItem[] = [];
    for (const it of items) {
      const lt = ltMap[it.leaveTypeId];
      if (!lt) {
        return NextResponse.json(
          {
            error: it.leaveTypeId
              ? `휴가 유형을 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 선택해 주세요. (ID 일부: ${String(it.leaveTypeId).slice(0, 8)}…)`
              : "휴가 유형이 비어 있습니다. 모든 항목에서 유형을 선택해 주세요.",
          },
          { status: 400 },
        );
      }
      const { slot, error } = normalizeTimeSlotInput(it.timeSlot, lt);
      if (error || slot == null) {
        return NextResponse.json({ error: error ?? "시간대를 확인해 주세요." }, { status: 400 });
      }

      const s = it.startDate.slice(0, 10);
      const e = it.endDate.slice(0, 10);
      let days = 0;
      if (slot === "FULL") {
        days =
          lt.code === "HOLIDAY_EXT" ? calcHolidayExtFullDays(s, e, holidayList) : calcWorkingDays(s, e, holidayList);
        if (days <= 0) {
          const errNoBiz =
            lt.code === "HOLIDAY_EXT"
              ? `${lt.name}: 영업일이 하루도 잡히지 않습니다. 주말·공휴일만 선택하면 0일이며, 휴무 3일 이상 연속에 붙는 앞·뒤·징검다리 영업일인지 확인하세요.`
              : `${lt.name}: 신청 기간에 포함된 영업일이 없습니다.`;
          return NextResponse.json({ error: errNoBiz }, { status: 400 });
        }
      } else {
        if (s !== e) {
          return NextResponse.json(
            { error: `${lt.name}: 반차는 하루만 선택할 수 있습니다.` },
            { status: 400 },
          );
        }
        if (isHolidayOrWeekendYmd(s, holidaySet)) {
          if (!(lt.code === "HOLIDAY_EXT" && isValidHolidayExtDay(s, holidaySet))) {
            return NextResponse.json({ error: `${lt.name}: 반차는 영업일에만 신청할 수 있습니다.` }, { status: 400 });
          }
        }
        days = 0.5;
      }
      if (lt.code === "HOLIDAY_EXT") {
        const checkDates = slot === "FULL" ? [s, e] : [s];
        for (const d of checkDates) {
          if (!isValidHolidayExtDay(d, holidaySet)) {
            return NextResponse.json(
              {
                error:
                  "연휴연장휴가는 공휴일/주말이 3일 이상 연속된 구간의 앞/뒤 하루이거나, 징검다리로 연휴가 이어지는 날에만 신청할 수 있습니다.",
              },
              { status: 400 },
            );
          }
        }
      }
      workItems.push({
        leaveTypeId: it.leaveTypeId,
        allocationId: it.allocationId,
        startDate: s,
        endDate: slot === "FULL" ? e : s,
        days,
        reason: it.reason,
        timeSlot: slot,
      });
    }

    // 동일한 날짜에 이미 신청/승인된 휴가가 있는지만 체크 (중간 날짜만 포함되는 넓은 구간은 허용)
    const overlappingItem = await prisma.leaveRequestItem.findFirst({
      where: {
        leaveRequest: {
          employeeId: user.employeeId,
          status: { in: ["PENDING", "APPROVED"] },
        },
        OR: workItems.map((it) => ({
          startDate: { lte: new Date(it.endDate) },
          endDate: { gte: new Date(it.startDate) },
        })),
      },
      include: { leaveRequest: true },
    });
    if (overlappingItem) {
      const r = overlappingItem.leaveRequest;
      return NextResponse.json(
        {
          error: `해당 날짜에 이미 휴가가 신청/승인되어 있습니다. (${kstYmd(r.startDate)} ~ ${kstYmd(r.endDate)})`,
        },
        { status: 400 },
      );
    }

    for (const it of workItems) {
      const lt = ltMap[it.leaveTypeId]!;

      if (!lt.isActive) {
        return NextResponse.json({ error: `비활성 처리된 휴가 유형입니다: ${lt.name}` }, { status: 400 });
      }

      if (lt.requiresStamp && lt.stampCount) {
        if (lt.code === "PM_RECOG_STAMP") {
          const slots = await countAfternoonEligible(prisma, user.employeeId);
          if (slots < 1) {
            return NextResponse.json(
              { error: `${lt.name}: 8칸이 모인 장에서 쓸 수 있는 오후인정 권한이 없습니다.` },
              { status: 400 },
            );
          }
        } else {
          const avail = await prisma.stampCoupon.count({ where: { employeeId: user.employeeId, isUsed: false } });
          if (avail < lt.stampCount) {
            return NextResponse.json(
              { error: `${lt.name}: 스탬프 ${lt.stampCount}개 필요 (현재 ${avail}개)` },
              { status: 400 },
            );
          }
        }
      }

      if (lt.code === PM_HALF_MONTH_CODE) {
        const ymd = it.startDate.slice(0, 10);
        if (!isWednesdayYMD(ymd)) {
          return NextResponse.json({ error: "하프데이는 수요일에만 신청할 수 있습니다." }, { status: 400 });
        }
      }

      if (lt.maxPerMonth) {
        const s = new Date(it.startDate);
        const cnt = await prisma.leaveRequestItem.count({
          where: {
            leaveTypeId: lt.id,
            leaveRequest: {
              employeeId: user.employeeId,
              status: { notIn: ["CANCELLED", "WITHDRAWN"] },
              startDate: {
                gte: new Date(s.getFullYear(), s.getMonth(), 1),
                lt: new Date(s.getFullYear(), s.getMonth() + 1, 1),
              },
            },
          },
        });
        if (cnt >= lt.maxPerMonth) {
          return NextResponse.json({ error: `${lt.name}은 이번 달 최대 사용 횟수를 초과했습니다.` }, { status: 400 });
        }
      }
    }

    /** 전용 풀(BASE_ANNUAL·CARE 등): 귀속 말일~익 귀속 초일을 한 덩어리로 두면 한 할당으로 구간 전체를 못 덮음 → 귀속연도별로 쪼갬 */
    const splitWorkItems: WorkItem[] = [];
    for (const it of workItems) {
      const lt = ltMap[it.leaveTypeId]!;
      const needSplit =
        lt.deductFromBalance &&
        Boolean(lt.allocationSourceCode?.trim()) &&
        it.timeSlot === "FULL" &&
        it.startDate <= it.endDate &&
        getFiscalYearFromStr(it.startDate) !== getFiscalYearFromStr(it.endDate);
      if (!needSplit) {
        splitWorkItems.push(it);
        continue;
      }
      for (const { startYmd, endYmd } of splitYmdRangeByFiscalYear(it.startDate, it.endDate)) {
        const segDays =
          lt.code === "HOLIDAY_EXT"
            ? calcHolidayExtFullDays(startYmd, endYmd, holidayList)
            : calcWorkingDays(startYmd, endYmd, holidayList);
        if (segDays <= 0) continue;
        splitWorkItems.push({
          ...it,
          allocationId: "",
          startDate: startYmd,
          endDate: endYmd,
          days: segDays,
        });
      }
    }

    const expandedWorkItems: WorkItem[] = [];
    for (const it of splitWorkItems) {
      const lt = ltMap[it.leaveTypeId];
      // allocationSourceCode 없을 때만: 영업일마다 1일씩 분리(신청·차감 단위). 예전 0.5+0.5 이중 행은 내역에 4줄로 보여 혼란스러워 1일 1행으로 통일.
      if (lt?.deductFromBalance && !lt.allocationSourceCode && it.timeSlot === "FULL") {
        const ymds = listWorkingYmds(it.startDate, it.endDate, holidayList);
        for (const d of ymds) {
          expandedWorkItems.push({ ...it, startDate: d, endDate: d, days: 1 });
        }
      } else {
        expandedWorkItems.push(it);
      }
    }

    const leaveMinYmd = expandedWorkItems.reduce(
      (m, i) => (i.startDate < m ? i.startDate : m),
      expandedWorkItems[0]!.startDate,
    );
    const leaveMaxYmd = expandedWorkItems.reduce(
      (m, i) => (i.endDate > m ? i.endDate : m),
      expandedWorkItems[0]!.endDate,
    );
    const leaveMinStart = new Date(`${leaveMinYmd}T00:00:00+09:00`);
    const leaveMaxEnd = new Date(`${leaveMaxYmd}T23:59:59.999+09:00`);

    const poolAllocsRaw = await prisma.leaveAllocation.findMany({
      where: {
        employeeId: user.employeeId,
        OR: [
          { sourceCode: { in: [...ANNUAL_CORE_SOURCE_CODES] } },
          { sourceCode: "ANNUAL" },
          { sourceCode: { startsWith: "MONTHLY_ACCRUAL_" } },
        ],
        isActive: true,
        validFrom: { lte: leaveMaxEnd },
        validUntil: { gte: leaveMinStart },
      },
    });
    poolAllocsRaw.sort((a, b) => {
      const rank = (sourceCode: string) => {
        if (sourceCode === "CARRYOVER") return 0;
        if (sourceCode === "TENURE_BONUS") return 1;
        if (sourceCode === "BASE_ANNUAL") return 2;
        if (sourceCode.startsWith("MONTHLY_ACCRUAL_")) return 3;
        if (sourceCode === "ANNUAL") return 4;
        return 9;
      };
      const ai = rank(a.sourceCode);
      const bi = rank(b.sourceCode);
      if (ai !== bi) return ai - bi;
      return new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime();
    });
    const poolAllocs = poolAllocsRaw;

    const poolSources = [
      ...new Set(
        items
          .map((i) => ltMap[i.leaveTypeId]?.allocationSourceCode?.trim())
          .filter((s): s is string => Boolean(s)),
      ),
    ];
    const dedicatedAllocsRaw =
      poolSources.length > 0
        ? await prisma.leaveAllocation.findMany({
            where: {
              employeeId: user.employeeId,
              sourceCode: { in: poolSources },
              isActive: true,
              validFrom: { lte: leaveMaxEnd },
              validUntil: { gte: leaveMinStart },
            },
          })
        : [];
    const allocsBySource = new Map<string, typeof dedicatedAllocsRaw>();
    for (const a of dedicatedAllocsRaw) {
      const list = allocsBySource.get(a.sourceCode) ?? [];
      list.push(a);
      allocsBySource.set(a.sourceCode, list);
    }

    const sourceLabel = (sourceCode: string) => {
      const fromType = Object.values(ltMap).find((t) => t.allocationSourceCode === sourceCode)?.name;
      const fromAlloc = (allocsBySource.get(sourceCode) ?? [])[0]?.label;
      return fromType || fromAlloc || sourceCode;
    };

    function poolCoversRange(startYmd: string, endYmd: string, a: (typeof poolAllocs)[0]) {
      return allocationFullyCoversKstYmdRange(a.validFrom, a.validUntil, startYmd, endYmd);
    }
    function dedicatedCoversRange(sourceCode: string, startYmd: string, endYmd: string, a: (typeof dedicatedAllocsRaw)[0]) {
      return a.sourceCode === sourceCode && allocationFullyCoversKstYmdRange(a.validFrom, a.validUntil, startYmd, endYmd);
    }

    const simPoolRem = new Map(poolAllocs.map((a) => [a.id, Math.max(0, a.totalDays - a.usedDays)]));
    for (const it of expandedWorkItems) {
      const lt = ltMap[it.leaveTypeId];
      if (!lt?.deductFromBalance || lt.allocationSourceCode) continue;
      const d = leaveItemDeductDays(it, lt);
      let ok = false;
      for (const a of poolAllocs) {
        if (!poolCoversRange(it.startDate, it.endDate, a)) continue;
        const cur = simPoolRem.get(a.id) ?? 0;
        if (cur >= d) {
          simPoolRem.set(a.id, cur - d);
          ok = true;
          break;
        }
      }
      if (!ok) {
        return NextResponse.json(
          {
            error: `잔여 연차가 부족하거나, 신청일(${it.startDate}~${it.endDate})을 한 할당의 유효기간이 모두 덮지 못합니다. 귀속·유효기간을 확인해 주세요.`,
          },
          { status: 400 },
        );
      }
    }

    const simDedRem = new Map<string, Map<string, number>>();
    for (const src of poolSources) {
      simDedRem.set(
        src,
        new Map((allocsBySource.get(src) ?? []).map((a) => [a.id, Math.max(0, a.totalDays - a.usedDays)])),
      );
    }
    for (const it of expandedWorkItems) {
      const lt = ltMap[it.leaveTypeId];
      if (!lt?.allocationSourceCode) continue;
      const src = lt.allocationSourceCode;
      const d = leaveItemDeductDays(it, lt);
      const rem = simDedRem.get(src)!;
      const list = allocsBySource.get(src) ?? [];
      let ok = false;
      for (const a of list) {
        if (!dedicatedCoversRange(src, it.startDate, it.endDate, a)) continue;
        if ((rem.get(a.id) ?? 0) >= d) {
          rem.set(a.id, (rem.get(a.id) ?? 0) - d);
          ok = true;
          break;
        }
      }
      if (!ok) {
        const cands = list.filter((a) => dedicatedCoversRange(src, it.startDate, it.endDate, a));
        const best = cands
          .filter((a) => (rem.get(a.id) ?? 0) > 0)
          .sort((a, b) => (rem.get(b.id) ?? 0) - (rem.get(a.id) ?? 0))[0];
        if (best && (rem.get(best.id) ?? 0) >= d) {
          rem.set(best.id, (rem.get(best.id) ?? 0) - d);
          ok = true;
        }
      }
      if (!ok) {
        return NextResponse.json(
          {
            error: `「${sourceLabel(src)}」신청일(${it.startDate}~${it.endDate})을 덮는 부여가 없거나 잔여가 부족합니다.`,
          },
          { status: 400 },
        );
      }
    }

    const employee = await prisma.employee.findUnique({
      where: { id: user.employeeId },
      include: { team: { include: { leader: true } } },
    });
    const teamLeader = employee?.team?.leader;
    const pm = await prisma.employee.findFirst({ where: { role: "PM", status: "ACTIVE" } });
    const isPmOrAdmin = employee?.role === "PM" || employee?.role === "ADMIN";
    const mainReason = workItems[0]?.reason ?? null;

    const poolRemaining = Object.fromEntries(poolAllocs.map((a) => [a.id, a.totalDays - a.usedDays]));
    const dedicatedRemainBySource = new Map<string, Record<string, number>>();
    for (const src of poolSources) {
      const list = allocsBySource.get(src) ?? [];
      dedicatedRemainBySource.set(
        src,
        Object.fromEntries(list.map((a) => [a.id, a.totalDays - a.usedDays])),
      );
    }

    function pickAllocation(days: number, startYmd: string, endYmd: string): string | null {
      for (const a of poolAllocs) {
        if (!poolCoversRange(startYmd, endYmd, a)) continue;
        if ((poolRemaining[a.id] ?? 0) >= days) {
          poolRemaining[a.id] -= days;
          return a.id;
        }
      }
      return null;
    }

    function pickDedicatedAllocation(sourceCode: string, days: number, startYmd: string, endYmd: string): string | null {
      const list = allocsBySource.get(sourceCode) ?? [];
      const rem = dedicatedRemainBySource.get(sourceCode)!;
      for (const a of list) {
        if (!dedicatedCoversRange(sourceCode, startYmd, endYmd, a)) continue;
        if ((rem[a.id] ?? 0) >= days) {
          rem[a.id] -= days;
          return a.id;
        }
      }
      const best = list
        .filter((a) => dedicatedCoversRange(sourceCode, startYmd, endYmd, a) && (rem[a.id] ?? 0) > 0)
        .sort((a, b) => (rem[b.id] ?? 0) - (rem[a.id] ?? 0))[0];
      if (best && (rem[best.id] ?? 0) >= days) {
        rem[best.id] = (rem[best.id] ?? 0) - days;
        return best.id;
      }
      return null;
    }

    const resolvedItems = expandedWorkItems.map((it) => {
      const lt = ltMap[it.leaveTypeId];
      const days = leaveItemDeductDays(it, lt);
      let allocationId = it.allocationId || null;
      if (lt?.allocationSourceCode && !allocationId) {
        allocationId = pickDedicatedAllocation(lt.allocationSourceCode, days, it.startDate, it.endDate);
      } else if (lt?.deductFromBalance && !allocationId) {
        allocationId = pickAllocation(days, it.startDate, it.endDate);
      }
      return { ...it, days, allocationId };
    });

    for (const it of resolvedItems) {
      const lt = ltMap[it.leaveTypeId];
      if (lt?.allocationSourceCode && !it.allocationId) {
        return NextResponse.json(
          {
            error: `${lt.name}: 부여된 일수가 없거나 잔여가 부족합니다. 휴가 부여(할당)를 확인해 주세요.`,
          },
          { status: 400 },
        );
      }
    }

    // 결재선: approvalSteps 0 = 자동승인, 1+ = 1단계 결재(역할 기반)
    // 결재자 = 팀원→팀장, 팀장→PM, PM/ADMIN→자동승인
    // SystemConfig.leaveApprovalPMId 로 팀장 결재 시 특정 PM 지정 가능
    const leaveApprovalPMCfg = await prisma.systemConfig.findUnique({ where: { key: "leaveApprovalPMId" } });
    const designatedPM = leaveApprovalPMCfg?.value
      ? await prisma.employee.findUnique({ where: { id: leaveApprovalPMCfg.value, status: "ACTIVE" } })
      : null;
    const effectivePM = designatedPM ?? pm;

    // approvalSteps 값에 관계없이 0=자동, 1+=1단계로 통일
    const requiresApproval = (steps: number) => steps > 0;

    // 모든 휴가를 approvalSteps 기준 0(자동) vs 1+(결재필요) 2그룹으로 분류
    const groupByApprovalLine = new Map<number, typeof resolvedItems>();
    for (const it of resolvedItems) {
      const steps = ltMap[it.leaveTypeId]?.approvalSteps ?? 1;
      const key = steps > 0 ? 1 : 0; // 1이상은 모두 1단계 결재로 통일
      if (!groupByApprovalLine.has(key)) groupByApprovalLine.set(key, []);
      groupByApprovalLine.get(key)!.push(it);
    }

    type ResolvedItem = (typeof resolvedItems)[number];
    const createdIds: string[] = [];

    const leaveReqs = await prisma.$transaction(async (tx) => {
      const results: {
        id: string;
        totalSteps: number;
        isAutoApprove: boolean;
        approver: typeof pm | null;
        groupItems: ResolvedItem[];
      }[] = [];

      for (const [approvalSteps, groupItems] of groupByApprovalLine) {
        const groupStart = new Date(
          Math.min(...groupItems.flatMap((i) => [new Date(i.startDate).getTime(), new Date(i.endDate).getTime()])),
        );
        const groupEnd = new Date(
          Math.max(...groupItems.flatMap((i) => [new Date(i.startDate).getTime(), new Date(i.endDate).getTime()])),
        );
        const groupTotalDays = groupItems.reduce((s, i) => s + i.days, 0);
        const totalSteps = requiresApproval(approvalSteps) ? 1 : 0;
        // 자동승인: PM/ADMIN 본인 신청, 또는 결재불필요(approvalSteps=0) 휴가
        const isGroupAutoApprove = isPmOrAdmin || totalSteps === 0;
        // 결재자: 팀원→팀장, 팀장→PM (역할 기반 1단계)
        const groupApprover = isGroupAutoApprove
          ? null
          : employee?.role === "TEAM_LEAD"
            ? effectivePM ?? teamLeader   // 팀장이 신청 시 PM이 결재
            : teamLeader ?? effectivePM;   // 팀원 신청 시 팀장이 결재, 없으면 PM

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
        results.push({
          id: req.id,
          totalSteps,
          isAutoApprove: isGroupAutoApprove,
          approver: groupApprover ?? null,
          groupItems,
        });

        for (const it of groupItems) {
          await tx.leaveRequestItem.create({
            data: {
              leaveRequestId: req.id,
              leaveTypeId: it.leaveTypeId,
              allocationId: it.allocationId || null,
              days: it.days,
              startDate: new Date(it.startDate),
              endDate: new Date(it.endDate),
              timeSlot: it.timeSlot,
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
            for (const item of reqWithItems.items) {
              let allocId = item.allocationId;
              if (!allocId) continue;
              const alloc = await tx.leaveAllocation.findUnique({ where: { id: allocId } });
              if (!alloc) continue;
              const itemStartYmd = kstYmd(new Date(item.startDate));
              const itemEndYmd = kstYmd(new Date(item.endDate));
              const coversItem = allocationFullyCoversKstYmdRange(
                alloc.validFrom,
                alloc.validUntil,
                itemStartYmd,
                itemEndYmd,
              );
              if (isAnnualPoolSourceCode(alloc.sourceCode)) {
                if (!alloc.isActive || !coversItem) {
                  const itemStart = new Date(`${itemStartYmd}T00:00:00+09:00`);
                  const itemEnd = new Date(`${itemEndYmd}T23:59:59.999+09:00`);
                  const fallback = await tx.leaveAllocation.findFirst({
                    where: {
                      employeeId: user.employeeId,
                      OR: [
                        { sourceCode: { in: [...ANNUAL_CORE_SOURCE_CODES] } },
                        { sourceCode: "ANNUAL" },
                        { sourceCode: { startsWith: "MONTHLY_ACCRUAL_" } },
                      ],
                      isActive: true,
                      validFrom: { lte: itemEnd },
                      validUntil: { gte: itemStart },
                    },
                    orderBy: { validUntil: "asc" },
                  });
                  const fb = fallback &&
                    allocationFullyCoversKstYmdRange(
                      fallback.validFrom,
                      fallback.validUntil,
                      itemStartYmd,
                      itemEndYmd,
                    )
                      ? fallback
                      : null;
                  allocId = fb?.id ?? null;
                }
              } else if (!alloc.isActive || !coversItem) {
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
          if (groupApprover) {
            await tx.leaveApproval.create({
              data: { leaveRequestId: req.id, approverId: groupApprover.id, step: 1, status: "PENDING" },
            });
          }
          const snapshotPayload = JSON.stringify({
            totalDays: groupTotalDays,
            types: groupItems.map((i) => ltMap[i.leaveTypeId]?.name ?? ""),
          });
          await tx.leaveHistory.create({
            data: {
              leaveRequestId: req.id,
              action: "SUBMITTED",
              actorId: user.employeeId,
              snapshot: snapshotPayload.length > 191 ? snapshotPayload.slice(0, 188) + "..." : snapshotPayload,
            },
          });
        }

        const groupStampUsages: { code: string; count: number }[] = [];
        for (const it of groupItems) {
          const lt = ltMap[it.leaveTypeId];
          if (lt?.requiresStamp && lt.stampCount) groupStampUsages.push({ code: lt.code, count: lt.stampCount });
        }
        for (const su of groupStampUsages) {
          if (su.code === "PM_RECOG_STAMP") {
            const card = await findAfternoonStampCard(tx, user.employeeId);
            if (!card) throw new Error("PM_RECOG_STAMP_SLOT_MISSING");
            const consumed = await tx.stampCard.updateMany({
              where: { id: card.id, afternoonUsed: false },
              data: { afternoonUsed: true, afternoonLeaveRequestId: req.id },
            });
            if (consumed.count === 0) throw new Error("PM_RECOG_STAMP_SLOT_MISSING");
          } else {
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
      }

      return results;
    });

    const warnings: string[] = [];
    for (const r of leaveReqs) {
      if (!r.isAutoApprove) {
        if (!r.approver?.phone) {
          warnings.push("결재자 연락처가 없어 카카오 알림톡을 발송하지 못했습니다.");
          continue;
        }
        if (r.approver.alimtalkEnabled === false) {
          warnings.push("결재자가 카카오 알림톡 미사용 상태라 알림톡을 발송하지 않았습니다.");
          continue;
        }
        try {
          const first = r.groupItems[0];
          const last = r.groupItems[r.groupItems.length - 1];
          await sendLeaveRequestAlimtalk(
            prisma,
            r.approver!.id,
            r.approver!.phone,
            r.approver!.name,
            employee!.name,
            r.groupItems.map((i) => ltMap[i.leaveTypeId]?.name).join("+"),
            first?.startDate ?? "",
            last?.endDate ?? "",
          );
        } catch (alimErr) {
          console.warn("[leave/request] 알림톡 발송 실패 (휴가 신청은 완료됨)", alimErr);
          warnings.push("카카오 알림톡 발송에 실패했습니다. (휴가 신청은 정상 처리됨)");
        }
      }
    }

    for (const id of createdIds) {
      await writeAudit({
        entityType: "LeaveRequest",
        entityId: id,
        action: "CREATED",
        actorId: user.employeeId,
        ip: getIp(req) ?? undefined,
      });
    }

    return NextResponse.json({
      ok: true,
      id: createdIds[0],
      ids: createdIds,
      warnings: warnings.length ? warnings : undefined,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.message === "PM_RECOG_STAMP_SLOT_MISSING") {
      return NextResponse.json(
        { error: "오후인정(스탬프) 권한이 없거나 이미 반영되었습니다. 새로고침 후 다시 시도해 주세요." },
        { status: 400 },
      );
    }
    console.error("[leave/request POST]", err.message, err);
    const msg =
      process.env.NODE_ENV === "development"
        ? `휴가 신청 처리 중 오류: ${err.message}`
        : "휴가 신청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

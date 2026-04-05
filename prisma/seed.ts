import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { APPLY_GROUP_BY_CODE } from "@/lib/leaveApplyGroups";
import {
  fiscalPeriod,
  formatTenureMilestoneAutoNote,
  getTenureMilestones,
} from "@/lib/leaveCalc";
import { findTenureMilestoneAllocation } from "@/lib/tenureAllocationDedupe";
import type { DB } from "@/lib/db";
import { loadTenureMilestoneConfigs } from "@/lib/tenureMilestoneFromDb";
import { tenureMilestoneValidUntil } from "@/lib/workdays";

// ── 인라인 유틸 (src/lib/leaveCalc 대신)
/** 기본연차 일수 (항상 15, 근속가산 별도) */
function calcAnnualDays(hireDate: Date, fiscalYearStart: Date, employeeType = "FULL"): number {
  if (employeeType !== "FULL") return 15;
  const ms = fiscalYearStart.getTime() - hireDate.getTime();
  const yearsOfService = Math.floor(ms / (365.25 * 24 * 3600 * 1000));
  if (yearsOfService < 1) return 0;
  return 15; // 기본연차는 항상 15일, 근속가산은 별도 TENURE_BONUS로
}
/** 근속가산 일수 (2년마다 +1, 최대 +10) */
function calcTenureBonus(hireDate: Date, fiscalYearStart: Date): number {
  const ms = fiscalYearStart.getTime() - hireDate.getTime();
  const years = Math.floor(ms / (365.25 * 24 * 3600 * 1000));
  return Math.min(Math.floor(years / 2), 10);
}
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 시드 데이터 생성 중... (없으면 추가, 있으면 유지)");

  // 재실행 시에도 기존 데이터 변경 없음: 없을 때만 insert, 있으면 스킵.

  // ── 팀 (없을 때만 생성)
  const pmTeam = await findOrCreateTeam("PM", 0);
  const t1     = await findOrCreateTeam("1팀", 1);
  const t2     = await findOrCreateTeam("2팀", 2);
  const t3     = await findOrCreateTeam("3팀", 3);

  // ── 사원 정의 (birthDate: 생일반차쿠폰 자동 부여용) — 없을 때만 생성
  type EmpDef = {
    empNo:string; name:string; pos:string; role:string;
    team:any; phone:string; hire:string; type?:string; birth?:string;
  };
  const empDefs: EmpDef[] = [
    { empNo:"E001", name:"이기공",  pos:"이사",       role:"PM",        team:pmTeam, phone:"010-5391-8106", hire:"2009-04-13" },
    { empNo:"E002", name:"김영현",  pos:"부장",       role:"TEAM_LEAD", team:t1,     phone:"010-1000-0001", hire:"2010-03-01" },
    { empNo:"E003", name:"김훈",    pos:"대리",       role:"STAFF",     team:t1,     phone:"010-1000-0002", hire:"2021-02-15", birth:"1990-06-15" },
    { empNo:"E004", name:"심정혁",  pos:"차장(팀장)", role:"TEAM_LEAD", team:t2,     phone:"010-1000-0003", hire:"2008-04-01" },
    { empNo:"E005", name:"김민재",  pos:"과장",       role:"STAFF",     team:t2,     phone:"010-1000-0004", hire:"2018-07-01" },
    { empNo:"E006", name:"박지은",  pos:"대리",       role:"STAFF",     team:t2,     phone:"010-1000-0005", hire:"2022-05-10", birth:"1995-11-20" },
    { empNo:"E007", name:"이수현",  pos:"차장",       role:"TEAM_LEAD", team:t3,     phone:"010-1000-0006", hire:"2015-03-02" },
    { empNo:"E008", name:"정우진",  pos:"사원",       role:"STAFF",     team:t3,     phone:"010-1000-0007", hire:"2024-08-01" },
    { empNo:"E099", name:"관리자",  pos:"이사",       role:"ADMIN",     team:pmTeam, phone:"010-9999-0000", hire:"2005-01-01" },
  ];

  const empMap: Record<string, any> = {};
  for (const e of empDefs) {
    let emp = await prisma.employee.findUnique({ where: { empNo: e.empNo } });
    if (!emp) {
      emp = await prisma.employee.create({
        data: {
          empNo:e.empNo, name:e.name, position:e.pos, role:e.role,
          teamId:e.team.id, phone:e.phone, hireDate:new Date(e.hire),
          status:"PENDING", employeeType: e.type ?? "FULL",
          birthDate: e.birth ? new Date(e.birth) : null,
        },
      });
    }
    empMap[e.empNo] = emp;
  }

  // 팀장 지정 (아직 leaderId가 null일 때만)
  const teamsToLead = [
    [t1, empMap["E002"]?.id], [t2, empMap["E004"]?.id], [t3, empMap["E007"]?.id], [pmTeam, empMap["E001"]?.id],
  ] as const;
  for (const [team, leaderId] of teamsToLead) {
    if (!leaderId) continue;
    const current = await prisma.team.findUnique({ where: { id: team.id }, select: { leaderId: true } });
    if (current?.leaderId == null) {
      await prisma.team.update({ where: { id: team.id }, data: { leaderId } });
    }
  }

  // ── 계정
  const accounts = [
    { empNo:"E001", username:"pm",     pw:"password1!" },
    { empNo:"E002", username:"team1",  pw:"password1!" },
    { empNo:"E003", username:"staff1", pw:"password1!" },
    { empNo:"E004", username:"team2",  pw:"password1!" },
    { empNo:"E005", username:"staff2", pw:"password1!" },
    { empNo:"E006", username:"staff3", pw:"password1!" },
    { empNo:"E007", username:"team3",  pw:"password1!" },
    { empNo:"E008", username:"staff4", pw:"password1!" },
    { empNo:"E099", username:"admin",  pw:"admin1234!" },
  ];
  for (const a of accounts) {
    const emp = empMap[a.empNo];
    const exists = await prisma.user.findUnique({ where:{employeeId:emp.id} });
    if (!exists) {
      await prisma.user.create({
        data:{ employeeId:emp.id, username:a.username, passwordHash:await bcrypt.hash(a.pw, 12) },
      });
      await prisma.employee.update({ where:{id:emp.id}, data:{status:"ACTIVE"} });
    }
  }

  // ── 휴가 유형
  await seedLeaveTypes();

  // ── 귀속연도 자동 부여 구분 (휴가관리에서 추가/제거 용이)
  const initSources: {
    sourceCode: string; label: string; sortOrder: number; defaultDays: number | null;
    tenureYears?: number | null; carryoverThresholdMonths?: number | null;
    bonusIntervalYears?: number | null; bonusMaxDays?: number | null;
    skipForFreelancer?: boolean; note?: string | null;
  }[] = [
    { sourceCode: "BASE_ANNUAL",  label: "기본연차",     sortOrder: 1, defaultDays: 15,   note: "1년 이상 15일, 미만 시 월별 발생" },
    { sourceCode: "TENURE_BONUS", label: "근속가산",     sortOrder: 2, defaultDays: null, bonusIntervalYears: 2, bonusMaxDays: 10, skipForFreelancer: true, note: "2년마다 +1일, 최대 10일 (프리랜서 제외)" },
    { sourceCode: "CARE",         label: "돌봄휴가",     sortOrder: 3, defaultDays: 2,    note: "전원 2일" },
    { sourceCode: "HOLIDAY_EXT",  label: "연휴연장휴가", sortOrder: 4, defaultDays: 1,    note: "전원 1일" },
    { sourceCode: "DUTY_DEPT",    label: "직무부서휴가", sortOrder: 5, defaultDays: 2,    note: "운영부/교육부/복지부 2일" },
    { sourceCode: "AWARD",        label: "포상휴가",     sortOrder: 6, defaultDays: null, note: "PM·관리자가 사원별 부여" },
    // 근속 기념일 기반 특별부여 (tenureYears: 스케줄러가 해당 주년에 자동 부여)
    { sourceCode: "TENURE_1Y",  label: "1년근속휴가",  sortOrder: 7, defaultDays: 3,  tenureYears: 1,  carryoverThresholdMonths: 3 },
    { sourceCode: "TENURE_5Y",  label: "5년근속휴가",  sortOrder: 8, defaultDays: 5,  tenureYears: 5  },
    { sourceCode: "TENURE_10Y", label: "10년근속휴가", sortOrder: 9, defaultDays: 10, tenureYears: 10 },
    { sourceCode: "BIRTHDAY_HALF", label: "생일반차", sortOrder: 10, defaultDays: null, note: "생일 해당 월 스케줄러 자동 부여 0.5일" },
  ];
  for (const s of initSources) {
    const existing = await prisma.allocationSourceConfig.findUnique({ where: { sourceCode: s.sourceCode } });
    if (existing) {
      await prisma.allocationSourceConfig.update({
        where: { sourceCode: s.sourceCode },
        data: {
          defaultDays:              s.defaultDays              ?? existing.defaultDays,
          tenureYears:              s.tenureYears              ?? existing.tenureYears,
          carryoverThresholdMonths: s.carryoverThresholdMonths ?? existing.carryoverThresholdMonths,
          bonusIntervalYears:       s.bonusIntervalYears       ?? existing.bonusIntervalYears,
          bonusMaxDays:             s.bonusMaxDays             ?? existing.bonusMaxDays,
          skipForFreelancer:        s.skipForFreelancer        ?? existing.skipForFreelancer,
        },
      });
    } else {
      await prisma.allocationSourceConfig.create({ data: s });
    }
  }

  // ── 스케줄러 유형 (없을 때만 생성)
  const jobTypes = [
    { jobKey: "monthly_accrual", name: "월별 연차 적립", description: "입사 1년 미만 직원 월 1일 적립", sortOrder: 1 },
    { jobKey: "tenure_check", name: "근속 기념일 휴가", description: "1·5·10년 근속일 도래 시 자동 부여", sortOrder: 2 },
    { jobKey: "birthday_half", name: "생일반차쿠폰", description: "생일 당일(또는 API yearMonth 시 해당 월) 0.5일 부여", sortOrder: 3 },
  ];
  for (const j of jobTypes) {
    if (await prisma.schedulerJobType.findUnique({ where: { jobKey: j.jobKey } })) continue;
    await prisma.schedulerJobType.create({ data: { ...j, description: j.description ?? null } });
  }

  // ── 귀속연도 2025 할당 + 샘플 신청 내역 (없을 때만 생성)
  const fy = 2025;
  const { start: fyStart, end: fyEnd } = fiscalPeriod(fy);
  const milestoneConfigsForSeed = await loadTenureMilestoneConfigs(prisma as unknown as DB);

  // 각 사원별 자동 계산 + 할당 생성 (없을 때만 insert)
  for (const e of empDefs) {
    const emp = empMap[e.empNo];
    const hire = new Date(e.hire);
    const baseDays = calcAnnualDays(hire, fyStart, e.type ?? "FULL");

    if (baseDays > 0) {
      await ensureOneAlloc(`a-${e.empNo}-base`, emp.id, "BASE_ANNUAL", "기본연차", baseDays, fyStart, fyEnd, fy);

      const bonus = calcTenureBonus(hire, fyStart);
      if (bonus > 0) {
        await ensureOneAlloc(`a-${e.empNo}-bonus`, emp.id, "TENURE_BONUS", `근속가산(+${bonus}일)`, bonus, fyStart, fyEnd, fy);
      }
    } else {
      // 1년 미만: 월별 발생 (간단히 n개월 * 1일)
      const months = Math.floor((fyEnd.getTime() - hire.getTime()) / (30 * 24 * 3600 * 1000));
      if (months > 0) {
        const monthly = Math.min(months, 12);
        await ensureOneAlloc(`a-${e.empNo}-base`, emp.id, "BASE_ANNUAL", `기본연차(월발생 ${monthly}일)`, monthly, hire, fyEnd, fy);
      }
    }

    // 근속 마일스톤 (운영과 동일: LeaveType·AllocationSourceConfig 메타 → 일수/코드/주년)
    const milestones = getTenureMilestones(hire, fyStart, fyEnd, milestoneConfigsForSeed);
    for (const m of milestones) {
      const dup = await findTenureMilestoneAllocation(prisma, emp.id, m.code, m.anniversaryYmd);
      if (dup) continue;
      const validUntil = tenureMilestoneValidUntil(m.grantDate, m.years);
      const note = formatTenureMilestoneAutoNote(m.anniversaryYmd, m.years);
      await prisma.leaveAllocation.create({
        data: {
          id: `a-${e.empNo}-${m.code}`,
          employeeId: emp.id,
          sourceCode: m.code,
          label: m.label,
          totalDays: m.days,
          usedDays: 0,
          validFrom: m.grantDate,
          validUntil,
          fiscalYear: null,
          note,
        },
      });
    }

    // 돌봄휴가: 전원 2일 (유형별 1개)
    await ensureOneAlloc(`a-${e.empNo}-care`, emp.id, "CARE", "돌봄휴가", 2, fyStart, fyEnd, fy);
    // 연휴연장휴가: 1일
    await ensureOneAlloc(`a-${e.empNo}-holiday-ext`, emp.id, "HOLIDAY_EXT", "연휴연장휴가", 1, fyStart, fyEnd, fy);

    // 생일반차: 생년월일 있는 사원에 대해 해당 월 0.5일 할당 (실제 운영은 스케줄러가 부여)
    if (e.birth) {
      const birth = new Date(e.birth);
      const y = fy;
      const monthStart = new Date(y, birth.getMonth(), 1);
      const monthEnd = new Date(y, birth.getMonth() + 1, 0);
      if (monthEnd >= fyStart && monthStart <= fyEnd) {
        // 연월 구분용 (202506 = 2025년 6월) — 동일 사원·동일 월 1개만
        const yearMonth = y * 100 + (birth.getMonth() + 1);
        await ensureOneAlloc(
          `a-${e.empNo}-birthday-${y}-${birth.getMonth() + 1}`,
          emp.id,
          "BIRTHDAY_HALF",
          "생일반차",
          0.5,
          monthStart,
          monthEnd,
          yearMonth
        );
      }
    }
  }

  // ── 샘플 휴가 신청 내역 (정합성 있는 데이터)
  await seedLeaveRequests(empMap);

  // ── 스탬프 (E003: 7칸 1장, 없을 때만 생성)
  const e3 = empMap["E003"].id;
  for (let i = 0; i < 7; i++) {
    const id = `seed-stamp-${i}`;
    if (await prisma.stampCoupon.findUnique({ where: { id } })) continue;
    const d = new Date(2025, i, 6);
    let card = await prisma.stampCard.findFirst({
      where: { employeeId: e3, filledCount: { lt: 10 } },
      orderBy: { sortOrder: "desc" },
    });
    if (!card) {
      const agg = await prisma.stampCard.aggregate({
        where: { employeeId: e3 },
        _max: { sortOrder: true },
      });
      card = await prisma.stampCard.create({
        data: { employeeId: e3, sortOrder: (agg._max.sortOrder ?? -1) + 1, filledCount: 0 },
      });
    }
    await prisma.stampCoupon.create({
      data: { id, employeeId: e3, stampDate: d, stampCardId: card.id },
    });
    await prisma.stampCard.update({
      where: { id: card.id },
      data: { filledCount: { increment: 1 } },
    });
  }

  // ── 공휴일 (API로 현재·다음 귀속연도까지 수집, 실패 시 스킵)
  const { syncHolidaysToDb, getHolidayYearRange } = await import("../src/lib/holidays");
  const hRange = getHolidayYearRange();
  const hResult = await syncHolidaysToDb(prisma, hRange.fromYear, hRange.toYear);
  if (hResult.failed) console.warn("  ⚠ 휴일 API 동기화 실패:", hResult.failed);
  else console.log("  ✅ 휴일 동기화:", hResult.synced, "건");

  // ── 모든 ACTIVE 사원에 대해 2025 CARE/HOLIDAY_EXT 할당 보장 (없을 때만) ─────
  await ensureFy2025CareAndHolidayForAll();

  console.log("✅ 시드 완료!");
  console.log("  admin / admin1234! | pm / password1! | team1 / password1! | staff1 / password1!");
}

// ─── 유틸 (모두 없을 때만 insert, 기존 행은 수정/삭제 안 함) ─────────────────
async function findOrCreateTeam(name: string, sortOrder: number) {
  const t = await prisma.team.findFirst({ where: { name } });
  if (t) return t;
  return prisma.team.create({ data: { name, sortOrder } });
}

/** 없을 때만 생성(지정 id 사용). 있으면 아무 것도 안 함 */
async function ensureOneAlloc(
  preferredId: string,
  employeeId: string,
  sourceCode: string,
  label: string,
  totalDays: number,
  validFrom: Date,
  validUntil: Date,
  fiscalYear: number | null,
  note?: string
) {
  const existing = await prisma.leaveAllocation.findFirst({
    where: { employeeId, sourceCode, fiscalYear },
  });
  if (existing) return;
  await prisma.leaveAllocation.create({
    data: {
      id: preferredId,
      employeeId,
      sourceCode,
      label,
      totalDays,
      usedDays: 0,
      validFrom,
      validUntil,
      fiscalYear,
      note: note ?? null,
    },
  });
}

// ─── 샘플 신청 내역 ──────────────────────────────────────
async function seedLeaveRequests(empMap: Record<string, any>) {
  // 각 사원의 할당 조회
  const getBasicAlloc = async (empId: string) => {
    return prisma.leaveAllocation.findFirst({
      where: { employeeId:empId, sourceCode:"BASE_ANNUAL", isActive:true },
    });
  };
  const getCareAlloc = async (empId: string) => {
    return prisma.leaveAllocation.findFirst({
      where: { employeeId:empId, sourceCode:"CARE", isActive:true },
    });
  };
  const getHolidayExtAlloc = async (empId: string) => {
    return prisma.leaveAllocation.findFirst({
      where: { employeeId:empId, sourceCode:"HOLIDAY_EXT", isActive:true },
    });
  };
  const getBirthdayHalfAlloc = async (empId: string) => {
    return prisma.leaveAllocation.findFirst({
      where: { employeeId:empId, sourceCode:"BIRTHDAY_HALF", isActive:true },
    });
  };

  // 휴가 유형 조회
  const ltAnnual    = await prisma.leaveType.findUnique({ where:{code:"ANNUAL"} });
  const ltCare     = await prisma.leaveType.findUnique({ where:{code:"CARE"} });
  const ltHalfDay  = await prisma.leaveType.findUnique({ where:{code:"PM_HALF_MONTH"} });
  const ltHolidayExt = await prisma.leaveType.findUnique({ where:{code:"HOLIDAY_EXT"} });
  const ltBirthdayHalf = await prisma.leaveType.findUnique({ where:{code:"BIRTHDAY_HALF"} });

  if (!ltAnnual) { console.warn("ANNUAL leave type not found, skipping leave requests"); return; }

  // PM 조회
  const pm = empMap["E001"];
  // 팀장들
  const tl1 = empMap["E002"];
  const tl2 = empMap["E004"];
  const tl3 = empMap["E007"];

  // helper
  async function createApprovedLeave(
    emp: any, teamLeader: any,
    leaveTypeId: string, allocId: string|null,
    startStr: string, endStr: string,
    days: number, reason: string,
    approvalSteps = 2
  ) {
    const start = new Date(startStr);
    const end   = new Date(endStr);
    const existCount = await prisma.leaveRequest.count({
      where:{ employeeId:emp.id, startDate:start, status:"APPROVED" },
    });
    if (existCount > 0) return; // 이미 있으면 스킵

    const req = await prisma.leaveRequest.create({
      data:{
        employeeId:emp.id, startDate:start, endDate:end,
        totalDays:days, reason,
        status:"APPROVED", currentStep:approvalSteps, totalSteps:approvalSteps,
      },
    });
    await prisma.leaveRequestItem.create({
      data:{
        leaveRequestId:req.id, leaveTypeId,
        allocationId:allocId, days, startDate:start, endDate:end, reason,
      },
    });
    // 팀장 승인
    await prisma.leaveApproval.create({
      data:{ leaveRequestId:req.id, approverId:teamLeader.id, step:1, status:"APPROVED", approvedAt:new Date(startStr) },
    });
    // PM 2차 (2단계인 경우)
    if (approvalSteps === 2) {
      await prisma.leaveApproval.create({
        data:{ leaveRequestId:req.id, approverId:pm.id, step:2, status:"APPROVED", approvedAt:new Date(startStr) },
      });
    }
    // 할당에서 차감
    if (allocId) {
      await prisma.leaveAllocation.update({
        where:{id:allocId},
        data:{ usedDays:{ increment:days } },
      });
    }
    await prisma.leaveHistory.create({
      data:{ leaveRequestId:req.id, action:"APPROVED", actorId:pm.id },
    });
    return req;
  }

  // ── E003 (staff1, 1팀) - 3.5일 사용 샘플
  const alloc3 = await getBasicAlloc(empMap["E003"].id);
  if (alloc3 && ltAnnual) {
    await createApprovedLeave(empMap["E003"], tl1, ltAnnual.id, alloc3.id,
      "2025-06-10", "2025-06-12", 3, "개인 사유", 2);
    // 반차 샘플: 통합 연차 + timeSlot=AM
    const r = await createApprovedLeave(empMap["E003"], tl1, ltAnnual.id, alloc3.id,
      "2025-07-15", "2025-07-15", 0.5, "병원 방문", 2);
    if (r) {
      await prisma.leaveRequestItem.updateMany({
        where: { leaveRequestId: r.id },
        data: { timeSlot: "AM" },
      });
    }
  }

  // ── E002 (team1, 1팀) - 8일 사용
  const alloc2 = await getBasicAlloc(empMap["E002"].id);
  if (alloc2 && ltAnnual) {
    await createApprovedLeave(empMap["E002"], pm, ltAnnual.id, alloc2.id,
      "2025-05-26", "2025-05-30", 5, "가족 여행", 2);
    await createApprovedLeave(empMap["E002"], pm, ltAnnual.id, alloc2.id,
      "2025-09-01", "2025-09-03", 3, "개인 사유", 2);
  }

  // ── E004 (team2) - 10일 사용
  const alloc4 = await getBasicAlloc(empMap["E004"].id);
  if (alloc4 && ltAnnual) {
    await createApprovedLeave(empMap["E004"], pm, ltAnnual.id, alloc4.id,
      "2025-06-02", "2025-06-04", 3, "개인 사유", 2);
    await createApprovedLeave(empMap["E004"], pm, ltAnnual.id, alloc4.id,
      "2025-08-11", "2025-08-15", 5, "하계 휴가", 2);
    await createApprovedLeave(empMap["E004"], pm, ltAnnual.id, alloc4.id,
      "2025-10-06", "2025-10-08", 3, "추석 연휴", 2);
  }

  // ── E005 (staff2, 2팀) - 6일
  const alloc5 = await getBasicAlloc(empMap["E005"].id);
  if (alloc5 && ltAnnual && ltHalfDay) {
    await createApprovedLeave(empMap["E005"], tl2, ltAnnual.id, alloc5.id,
      "2025-07-21", "2025-07-25", 5, "하계 휴가", 2);
    await createApprovedLeave(empMap["E005"], tl2, ltHalfDay?.id ?? ltAnnual.id, null,
      "2025-09-15", "2025-09-15", 0.5, "하프데이 사용", 1);
  }

  // ── E007 (team3) - 4일 연차 + 돌봄 2일 (돌봄 전용 할당에서 차감)
  const alloc7 = await getBasicAlloc(empMap["E007"].id);
  const careAlloc7 = await getCareAlloc(empMap["E007"].id);
  if (alloc7 && ltAnnual && ltCare && careAlloc7) {
    await createApprovedLeave(empMap["E007"], pm, ltAnnual.id, alloc7.id,
      "2025-08-04", "2025-08-07", 4, "개인 사유", 2);
    await createApprovedLeave(empMap["E007"], pm, ltCare.id, careAlloc7.id,
      "2025-11-10", "2025-11-11", 2, "돌봄 (간호)", 2);
  }

  // ── E001 (PM) - 5일
  const alloc1 = await getBasicAlloc(empMap["E001"].id);
  if (alloc1 && ltAnnual) {
    await createApprovedLeave(empMap["E001"], pm, ltAnnual.id, alloc1.id,
      "2025-07-28", "2025-08-01", 5, "하계 휴가", 1);
  }

  // ── E006 (staff3, 2팀) - 2일
  const alloc6 = await getBasicAlloc(empMap["E006"].id);
  if (alloc6 && ltAnnual) {
    await createApprovedLeave(empMap["E006"], tl2, ltAnnual.id, alloc6.id,
      "2025-09-22", "2025-09-23", 2, "개인 사유", 2);
  }

  // ── E005 연휴연장휴가 1일 사용 (규정: 귀속연도 1일, 1일 단위만)
  const extAlloc5 = await getHolidayExtAlloc(empMap["E005"].id);
  if (ltHolidayExt && extAlloc5) {
    await createApprovedLeave(empMap["E005"], tl2, ltHolidayExt.id, extAlloc5.id,
      "2025-07-09", "2025-07-09", 1, "연휴연장휴가 사용", 2);
  }

  // ── E008 (staff4, 3팀) 대기 중인 휴가 1건 (팀장 결재 대기)
  const alloc8 = await getBasicAlloc(empMap["E008"].id);
  if (alloc8 && ltAnnual) {
    const pendingStart = new Date("2025-12-02");
    const pendingEnd = new Date("2025-12-02");
    const existing = await prisma.leaveRequest.findFirst({
      where: { employeeId: empMap["E008"].id, startDate: pendingStart, status: "PENDING" },
    });
    if (!existing) {
      const req = await prisma.leaveRequest.create({
        data: {
          employeeId: empMap["E008"].id,
          startDate: pendingStart,
          endDate: pendingEnd,
          totalDays: 1,
          reason: "개인 사유 (결재 대기 샘플)",
          status: "PENDING",
          currentStep: 1,
          totalSteps: 2,
        },
      });
      await prisma.leaveRequestItem.create({
        data: {
          leaveRequestId: req.id,
          leaveTypeId: ltAnnual.id,
          allocationId: alloc8.id,
          days: 1,
          startDate: pendingStart,
          endDate: pendingEnd,
          reason: "개인 사유 (결재 대기 샘플)",
        },
      });
      await prisma.leaveApproval.create({
        data: { leaveRequestId: req.id, approverId: tl3.id, step: 1, status: "PENDING" },
      });
      await prisma.leaveHistory.create({
        data: { leaveRequestId: req.id, action: "SUBMITTED", actorId: empMap["E008"].id },
      });
    }
  }

  // ── 생일반차: E003 6월 생일 가정, 2025-06 해당 월 0.5일 부여 후 사용
  const bhAlloc3 = await getBirthdayHalfAlloc(empMap["E003"].id);
  if (ltBirthdayHalf && bhAlloc3) {
    await createApprovedLeave(empMap["E003"], tl1, ltBirthdayHalf.id, bhAlloc3.id,
      "2025-06-20", "2025-06-20", 0.5, "생일반차 사용", 1);
  }
}

// ─── 휴가유형 ────────────────────────────────────────────
// approvalSteps: 저장 시 0·1로 통일(역할 1단). 예전 2도 동일 의미. (seed-base.ts와 동일)
async function seedLeaveTypes() {
  const types = [
    // [code, name, dpu, deduct, steps, maxMon, maxYr, stamp, stampCnt, isHalf, amOnly, pmOnly, vBasis, vMon, color, sort]
    ["ANNUAL",         "연차",              1,   true,  1, null, null, false, null, false,false,false,"귀속연도",    null,  "#3b82f6",  0],
    ["POOL_TENURE_BONUS", "근속가산(시스템)", 1, false, 1, null, null, false, null, false,false,false,"귀속연도", null, "#94a3b8", 98],
    ["CONDOLENCE",     "경조휴가",          1,   false, 2, null, null, false, null, false,false,false,"부여일기준",  null,  "#f59e0b",  3],
    ["CARE",           "돌봄휴가",          1,   false, 1, null, 2,    false, null, false,false,false,"귀속연도",    null,  "#10b981",  4],
    ["PUBLIC",         "공가",              1,   false, 2, null, null, false, null, false,false,false,"귀속연도",    null,  "#64748b",  7],
    ["RECOGNITION",    "인정휴가",          1,   false, 2, null, null, false, null, false,false,false,"귀속연도",    null,  "#64748b", 10],
    ["PM_HALF_MONTH",  "하프데이",          0.5, false, 1, 1,    null, false, null, true, false,true, "귀속연도",    null,  "#0ea5e9", 13],
    ["SICK",           "병가",              1,   false, 2, null, null, false, null, false,false,false,"귀속연도",    null,  "#ef4444", 14],
    ["HEALING_DAY",    "힐링데이",          0,   false, 0, null, null, true,  5,    false,false,false,"부여일기준",  null,  "#f59e0b", 15],
    ["PM_RECOG_STAMP", "오후인정(스탬프)",  0.5, false, 1, null, null, true,  10,   true, false,true, "부여일기준",  null,  "#a855f7", 16],
    ["TENURE_1Y",      "1년근속휴가",       3,   false, 1, null, null, false, null, false,false,false,"입사일기준",  12,    "#10b981", 17],
    ["TENURE_5Y",      "5년근속휴가",       5,   false, 1, null, null, false, null, false,false,false,"입사일기준",  12,    "#10b981", 18],
    ["TENURE_10Y",     "10년근속휴가",      10,  false, 1, null, null, false, null, false,false,false,"입사일기준",  12,    "#10b981", 19],
    ["AWARD",          "포상휴가",          1,   false, 2, null, null, false, null, false,false,false,"부여일기준",  12,    "#f59e0b", 20],
    ["HOLIDAY_EXT",       "연휴연장",            1,   false, 1, null, null, false, null, false,false,false,"귀속연도",    null,  "#0ea5e9", 21],
    ["BIRTHDAY_HALF",     "생일반차",            0.5, false, 1, null, null, false, null, true, false,true, "부여일기준", 3,   "#ec4899", 25],
  ] as const;

  function allocationSourceForCode(lc: string): string | null {
    if (lc === "ANNUAL") return "BASE_ANNUAL";
    if (lc === "POOL_TENURE_BONUS") return "TENURE_BONUS";
    if (lc === "CARE") return "CARE";
    if (lc === "HOLIDAY_EXT") return "HOLIDAY_EXT";
    if (lc === "BIRTHDAY_HALF") return "BIRTHDAY_HALF";
    if (lc === "TENURE_1Y" || lc === "TENURE_5Y" || lc === "TENURE_10Y") return lc;
    if (lc === "AWARD") return "AWARD";
    return null;
  }
  function usageCategoryForCode(code: string): "ASSET" | "REASON" {
    if (["PUBLIC", "RECOGNITION", "SICK", "CONDOLENCE"].includes(code)) return "REASON";
    return "ASSET";
  }
  function hireAnniversaryYearsForCode(code: string): number | null {
    if (code === "TENURE_1Y") return 1;
    if (code === "TENURE_5Y") return 5;
    if (code === "TENURE_10Y") return 10;
    return null;
  }
  function displayHintForCode(code: string): string | null {
    if (code === "ANNUAL") return "기본·근속가산·이월 합산";
    if (code === "SICK") return "입원·통원 등";
    if (code === "CARE") return "연 2일 한도";
    if (code === "HOLIDAY_EXT") return "휴무 3일+ 연속 시 전후·징검다리 영업일 1일";
    if (code === "PM_HALF_MONTH") return "수요일 오후";
    if (code === "BIRTHDAY_HALF") return "생일이 있는 달에 자동 부여 0.5일(부여 후 3개월 유효)";
    if (code === "AWARD") return "별도 부여";
    if (code === "PM_RECOG_STAMP") return "10칸 완성 장당 1회";
    if (code === "TENURE_1Y") return "입사 1주년 부여";
    if (code === "TENURE_5Y") return "입사 5주년 부여";
    if (code === "TENURE_10Y") return "입사 10주년 부여";
    return null;
  }
  function carryoverEligibleForCode(code: string): boolean {
    return code === "ANNUAL" || code === "POOL_TENURE_BONUS";
  }
  function includeInFiscalInitForCode(code: string): boolean {
    return code !== "AWARD" && code !== "POOL_TENURE_BONUS";
  }

  for (const [code,name,dpu,deduct,steps,maxMon,maxYr,stamp,stampCnt,isHalf,amOnly,pmOnly,vBasis,vMon,color,sort] of types) {
    if (await prisma.leaveType.findUnique({ where: { code } })) continue;
    const half = !!(isHalf as boolean);
    const allowsFullDay = !half;
    const allowsHalfDay = half;
    const halfDayAmPm = !half
      ? "BOTH"
      : (amOnly as boolean)
        ? "AM_ONLY"
        : (pmOnly as boolean)
          ? "PM_ONLY"
          : "BOTH";
    const data = {
      code,
      name, daysPerUnit:dpu as number,
      deductFromBalance:deduct as boolean,
      approvalSteps:steps as number,
      maxPerMonth:maxMon as number|null,
      maxPerYear:maxYr as number|null,
      requiresStamp:stamp as boolean,
      stampCount:stampCnt as number|null,
      allocationSourceCode: allocationSourceForCode(code),
      usageCategory: usageCategoryForCode(code),
      displayHint: displayHintForCode(code),
      hireAnniversaryYears: hireAnniversaryYearsForCode(code),
      carryoverEligible: carryoverEligibleForCode(code),
      includeInFiscalInit: includeInFiscalInitForCode(code),
      allowsFullDay,
      allowsHalfDay,
      halfDayAmPm,
      applyGroupKey: APPLY_GROUP_BY_CODE[code] ?? null,
      isHalf:isHalf as boolean, isAmOnly:amOnly as boolean, isPmOnly:pmOnly as boolean,
      validityBasis:vBasis as string,
      validityMonths:vMon as number|null,
      color, sortOrder:sort as number,
    };
    await prisma.leaveType.create({ data });
  }
}

/** ACTIVE 사원 전체에 대해 2025 귀속 CARE/HOLIDAY_EXT 할당 보장 (없을 때만 생성) */
async function ensureFy2025CareAndHolidayForAll() {
  const fy = 2025;
  const { start: fyStart, end: fyEnd } = fiscalPeriod(fy);
  const employees = await prisma.employee.findMany({ where: { status: "ACTIVE" } });

  for (const emp of employees as any[]) {
    const baseId = (emp.empNo as string | undefined) ?? emp.id;
    await ensureOneAlloc(
      `a-${baseId}-care-2025`,
      emp.id,
      "CARE",
      "돌봄휴가",
      2,
      fyStart,
      fyEnd,
      fy
    );
    await ensureOneAlloc(
      `a-${baseId}-holiday-ext-2025`,
      emp.id,
      "HOLIDAY_EXT",
      "연휴연장휴가",
      1,
      fyStart,
      fyEnd,
      fy
    );
  }

  // ── 공지사항 샘플 1건 (없을 때만)
  const noticeCount = await prisma.notice.count();
  if (noticeCount === 0) {
    const adminEmp = await prisma.employee.findFirst({ where: { role: { in: ["ADMIN", "PM"] } } });
    if (adminEmp) {
      await prisma.notice.create({
        data: {
          title: "2026년 5월 귀속연도부터 휴가·숙소 관리 시스템 운영 안내",
          content: `<p><strong>안녕하세요.</strong></p><p>2026년 5월 귀속연도부터 휴가와 제주도 숙소 관리를 이 시스템으로 진행할 예정입니다.</p><p>부족한 점이 많겠지만, 잘못된 점이나 불편한 점이 있으면 <strong>건의</strong>해 주시면 반영하겠습니다.</p><p>감사합니다.</p>`,
          authorId: adminEmp.id,
        },
      });
      console.log("  ✓ 공지사항 샘플 1건 생성");
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

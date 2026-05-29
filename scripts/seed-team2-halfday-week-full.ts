/**
 * 로컬 테스트: 2팀 같은 주(월~일) 하프데이 4명 신청 상태 세팅
 * 실행: npx tsx scripts/seed-team2-halfday-week-full.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDaysYMD, calendarUtcDowFromYMD, todayKstYmd } from "@/lib/dateUtils";
import { kstMidnightFromYmd } from "@/lib/workdays";
import {
  firstWednesdayYmdOfMonth,
  weekStartYmdFromYmd,
  TEAM_HALF_WEEKLY_LIMIT_TEAM_NAME,
} from "@/lib/halfdayPolicy";

const prisma = new PrismaClient();

const TEST_EMP_4 = {
  empNo: "E2T4",
  name: "2팀테스트4",
  username: "staff2t4",
  password: "password1!",
};

const TEST_EMP_5 = {
  empNo: "E2T5",
  name: "2팀테스트5",
  username: "staff2t5",
  password: "password1!",
};

async function ensureTestMember(
  def: { empNo: string; name: string; username: string; password: string },
  teamId: string,
  phoneSuffix: string,
) {
  let emp = await prisma.employee.findUnique({ where: { empNo: def.empNo } });
  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        empNo: def.empNo,
        name: def.name,
        position: "대리",
        role: "STAFF",
        teamId,
        phone: `010-2000-${phoneSuffix}`,
        hireDate: new Date("2020-01-15"),
        status: "ACTIVE",
        employeeType: "FULL",
      },
    });
    const userExists = await prisma.user.findUnique({ where: { employeeId: emp.id } });
    if (!userExists) {
      await prisma.user.create({
        data: {
          employeeId: emp.id,
          username: def.username,
          passwordHash: await bcrypt.hash(def.password, 12),
        },
      });
    }
    console.log(`  + 테스트 사원 생성: ${def.username} / ${def.password}`);
  } else if (emp.teamId !== teamId) {
    await prisma.employee.update({ where: { id: emp.id }, data: { teamId, status: "ACTIVE" } });
  }
  return emp;
}

/** 오늘 이후(포함) 가장 가까운 수요일 — 같은 주에 테스트하기 위함 */
function nextWednesdayOnOrAfter(today: string): string {
  let cur = today.slice(0, 10);
  for (let i = 0; i < 8; i++) {
    if (calendarUtcDowFromYMD(cur) === 3) return cur;
    cur = addDaysYMD(cur, 1);
  }
  return firstWednesdayYmdOfMonth(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)),
  );
}

async function main() {
  const today = todayKstYmd();
  const halfYmd = nextWednesdayOnOrAfter(today);
  const weekStart = weekStartYmdFromYmd(halfYmd);
  const halfDate = kstMidnightFromYmd(halfYmd);

  const team = await prisma.team.findFirst({
    where: { name: TEAM_HALF_WEEKLY_LIMIT_TEAM_NAME },
    include: {
      leader: true,
      employees: {
        where: { status: { in: ["ACTIVE", "PENDING", "INVITED"] } },
        orderBy: { empNo: "asc" },
      },
    },
  });
  if (!team) throw new Error("2팀을 찾을 수 없습니다. npm run db:seed:dev 를 먼저 실행하세요.");

  const lt = await prisma.leaveType.findUnique({ where: { code: "PM_HALF_MONTH" } });
  if (!lt) throw new Error("PM_HALF_MONTH 휴가 유형이 없습니다.");

  const leader = team.leader ?? team.employees.find((e) => e.role === "TEAM_LEAD");
  if (!leader) throw new Error("2팀 팀장을 찾을 수 없습니다.");

  await ensureTestMember(TEST_EMP_4, team.id, "0004");
  await ensureTestMember(TEST_EMP_5, team.id, "0005");

  const members = await prisma.employee.findMany({
    where: { teamId: team.id, status: "ACTIVE" },
    orderBy: { empNo: "asc" },
  });

  const fifthTester = await prisma.employee.findUnique({ where: { empNo: TEST_EMP_5.empNo } });
  if (members.length < 5) {
    throw new Error(`2팀 ACTIVE 사원이 ${members.length}명뿐입니다. 5명 이상 필요합니다.`);
  }

  // 이전 로컬테스트 하프데이 신청 제거(같은 팀)
  const oldTestReqs = await prisma.leaveRequest.findMany({
    where: {
      reason: "[로컬테스트] 2팀 주간 하프데이 4명 한도",
      employee: { teamId: team.id },
    },
    select: { id: true },
  });
  const oldIds = oldTestReqs.map((r) => r.id);
  if (oldIds.length > 0) {
    await prisma.leaveApproval.deleteMany({ where: { leaveRequestId: { in: oldIds } } });
    await prisma.leaveHistory.deleteMany({ where: { leaveRequestId: { in: oldIds } } });
    await prisma.leaveRequestItem.deleteMany({ where: { leaveRequestId: { in: oldIds } } });
    await prisma.leaveRequest.deleteMany({ where: { id: { in: oldIds } } });
  }

  const targets = members.filter((m) => m.id !== fifthTester?.id).slice(0, 4);
  console.log(`\n📅 하프데이 사용일: ${halfYmd} (해당 주 월요일: ${weekStart}, 오늘 ${today})`);
  console.log(`👥 2팀 — 아래 4명에 하프데이 신청(대기) 생성:\n`);

  for (const emp of targets) {
    const existing = await prisma.leaveRequestItem.findFirst({
      where: {
        leaveTypeId: lt.id,
        startDate: halfDate,
        leaveRequest: {
          employeeId: emp.id,
          status: { notIn: ["CANCELLED", "WITHDRAWN", "REJECTED"] },
        },
      },
    });
    if (existing) {
      console.log(`  · ${emp.name} (${emp.empNo}) — 이미 있음, 스킵`);
      continue;
    }

    const req = await prisma.leaveRequest.create({
      data: {
        employeeId: emp.id,
        startDate: halfDate,
        endDate: halfDate,
        totalDays: 0.5,
        reason: "[로컬테스트] 2팀 주간 하프데이 4명 한도",
        status: "PENDING",
        currentStep: 1,
        totalSteps: 1,
      },
    });
    await prisma.leaveRequestItem.create({
      data: {
        leaveRequestId: req.id,
        leaveTypeId: lt.id,
        days: 0.5,
        startDate: halfDate,
        endDate: halfDate,
        timeSlot: "PM",
        reason: "[로컬테스트] 2팀 주간 하프데이 4명 한도",
      },
    });
    await prisma.leaveApproval.create({
      data: {
        leaveRequestId: req.id,
        approverId: leader.id,
        step: 1,
        status: "PENDING",
      },
    });
    const user = await prisma.user.findUnique({ where: { employeeId: emp.id }, select: { username: true } });
    console.log(`  · ${emp.name} (${emp.empNo}) — 신청 생성${user ? ` · 로그인 ${user.username}` : ""}`);
  }

  console.log("\n✅ 4명 신청 완료. 5번째 신청 테스트:");
  if (fifthTester) {
    console.log(
      `   → ${TEST_EMP_5.username} / ${TEST_EMP_5.password} (${fifthTester.name}) 로그인`,
    );
    console.log(`   → 휴가 신청 → 하프데이 → 날짜 ${halfYmd} 선택`);
  }
  console.log(`   → 메시지: 한주 하프데이 최대인원 4명을 초과하였습니다.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

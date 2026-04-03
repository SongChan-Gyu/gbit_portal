/**
 * 로컬/개발용: pm·team1 등 테스트 계정으로 로그인 가능하도록 보장
 * - seed.ts(prisma/seed.ts)와 동일한 아이디/비번
 * 실행: npm run db:ensure-pm
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DEV_PASSWORD = "password1!";

async function findOrCreateTeam(name: string, sortOrder: number) {
  let t = await prisma.team.findFirst({ where: { name } });
  if (!t) t = await prisma.team.create({ data: { name, sortOrder } });
  return t;
}

type EnsureDef = {
  empNo: string;
  username: string;
  name: string;
  position: string;
  role: string;
  teamName: string;
  teamSortOrder: number;
  phone: string;
  hireDate: string;
  setTeamLeader?: boolean;
};

const ACCOUNTS: EnsureDef[] = [
  {
    empNo: "E001",
    username: "pm",
    name: "이기공",
    position: "이사",
    role: "PM",
    teamName: "PM",
    teamSortOrder: 0,
    phone: "010-5391-8106",
    hireDate: "2009-04-13",
    setTeamLeader: true,
  },
  {
    empNo: "E002",
    username: "team1",
    name: "김영현",
    position: "부장",
    role: "TEAM_LEAD",
    teamName: "1팀",
    teamSortOrder: 1,
    phone: "010-1000-0001",
    hireDate: "2010-03-01",
    setTeamLeader: true,
  },
];

async function ensureAccount(def: EnsureDef, passwordHash: string) {
  const team = await findOrCreateTeam(def.teamName, def.teamSortOrder);

  let emp = await prisma.employee.findUnique({ where: { empNo: def.empNo } });
  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        empNo: def.empNo,
        name: def.name,
        position: def.position,
        role: def.role,
        teamId: team.id,
        phone: def.phone,
        hireDate: new Date(def.hireDate),
        status: "ACTIVE",
        employeeType: "FULL",
      },
    });
    if (def.setTeamLeader) {
      const cur = await prisma.team.findUnique({ where: { id: team.id }, select: { leaderId: true } });
      if (cur?.leaderId == null) {
        await prisma.team.update({ where: { id: team.id }, data: { leaderId: emp.id } });
      }
    }
    console.log(`  사원 ${def.empNo}(${def.username}) 생성`);
  } else {
    await prisma.employee.update({
      where: { id: emp.id },
      data: { status: "ACTIVE" },
    });
  }

  const userByName = await prisma.user.findUnique({ where: { username: def.username } });
  if (userByName && userByName.employeeId !== emp.id) {
    console.error(
      `오류: 아이디 '${def.username}'이(가) 다른 사원(employeeId=${userByName.employeeId})에 연결되어 있습니다. DB를 확인하세요.`,
    );
    process.exit(1);
  }

  const userByEmp = await prisma.user.findUnique({ where: { employeeId: emp.id } });
  if (userByEmp) {
    await prisma.user.update({
      where: { id: userByEmp.id },
      data: { username: def.username, passwordHash },
    });
    console.log(`✅ ${def.username} / ${DEV_PASSWORD} (${def.empNo} 동기화)`);
  } else {
    await prisma.user.create({
      data: { employeeId: emp.id, username: def.username, passwordHash },
    });
    console.log(`✅ ${def.username} / ${DEV_PASSWORD} (계정 생성)`);
  }
}

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
  for (const def of ACCOUNTS) {
    await ensureAccount(def, passwordHash);
  }
  console.log(`\n완료: ${ACCOUNTS.map((a) => `${a.username} / ${DEV_PASSWORD}`).join(" · ")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

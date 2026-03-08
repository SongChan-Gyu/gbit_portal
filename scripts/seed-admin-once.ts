/**
 * DB에 사용자가 한 명도 없을 때만 admin 계정 1개 생성.
 * Railway: railway run npx tsx scripts/seed-admin-once.ts
 * 로컬(공개 URL): DATABASE_URL="mysql://..." npx tsx scripts/seed-admin-once.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log("이미 사용자가 있습니다. 건너뜁니다.");
    return;
  }

  // 팀 1개 (없으면 생성)
  let team = await prisma.team.findFirst({ where: { name: "PM" } });
  if (!team) {
    team = await prisma.team.create({
      data: { name: "PM", sortOrder: 0 },
    });
    console.log("팀 PM 생성");
  }

  // 사원 1명 (admin)
  let emp = await prisma.employee.findFirst({ where: { empNo: "E099" } });
  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        empNo: "E099",
        name: "관리자",
        position: "이사",
        role: "ADMIN",
        teamId: team.id,
        hireDate: new Date("2005-01-01"),
        phone: "010-9999-0000",
        status: "ACTIVE",
        employeeType: "FULL",
      },
    });
    console.log("사원(관리자) 생성");
  } else {
    await prisma.employee.update({
      where: { id: emp.id },
      data: { status: "ACTIVE" },
    });
  }

  // 로그인 계정
  const existing = await prisma.user.findUnique({ where: { employeeId: emp.id } });
  if (existing) {
    console.log("admin 계정이 이미 있습니다.");
    return;
  }
  await prisma.user.create({
    data: {
      employeeId: emp.id,
      username: "admin",
      passwordHash: await bcrypt.hash("admin1234!", 12),
    },
  });
  console.log("✅ admin 계정 생성 완료. 로그인: 아이디 admin / 비밀번호 admin1234!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

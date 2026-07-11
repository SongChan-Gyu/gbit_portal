import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const name = process.argv[2] ?? "김민재";
  const emp = await prisma.employee.findFirst({
    where: { name },
    select: { id: true, name: true, empNo: true, dutyDept: true, user: { select: { username: true } } },
  });
  if (!emp) {
    console.error(`사원을 찾을 수 없습니다: ${name}`);
    process.exit(1);
  }

  const updated = await prisma.employee.update({
    where: { id: emp.id },
    data: { dutyDept: "WELFARE" },
    select: { name: true, empNo: true, dutyDept: true, user: { select: { username: true } } },
  });

  console.log("✅ 복지부(WELFARE)로 변경 완료");
  console.log(
    `   ${updated.name} (${updated.empNo})` +
      (updated.user?.username ? ` / ${updated.user.username}` : "") +
      ` → dutyDept=${updated.dutyDept}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

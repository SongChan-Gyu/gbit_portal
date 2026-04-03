/**
 * 기존 Employee.phone / Employee.email 평문 데이터를 AES-256-GCM으로 암호화하는 마이그레이션 스크립트
 *
 * 실행 전: .env 파일에 FIELD_ENCRYPT_KEY=<64자리 hex> 설정 필수
 * 실행 방법: npx ts-node -r tsconfig-paths/register scripts/encrypt-employee-pii.ts
 *
 * 이미 "ENC:v1:" 접두사가 붙은 값은 건너뜁니다 (멱등성).
 */
import { PrismaClient } from "@prisma/client";
import { encryptField } from "../src/lib/fieldCrypto";

const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    select: { id: true, phone: true, email: true },
  });

  let encrypted = 0;
  let skipped = 0;

  for (const emp of employees) {
    const newPhone = emp.phone ? encryptField(emp.phone) : emp.phone;
    const newEmail = emp.email ? encryptField(emp.email) : emp.email;

    const phoneChanged = newPhone !== emp.phone;
    const emailChanged = newEmail !== emp.email;

    if (!phoneChanged && !emailChanged) {
      skipped++;
      continue;
    }

    await prisma.employee.update({
      where: { id: emp.id },
      data: {
        ...(phoneChanged ? { phone: newPhone } : {}),
        ...(emailChanged ? { email: newEmail } : {}),
      },
    });
    encrypted++;
    console.log(`[암호화] ${emp.id} phone=${phoneChanged} email=${emailChanged}`);
  }

  console.log(`\n완료: ${encrypted}명 암호화, ${skipped}명 건너뜀`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

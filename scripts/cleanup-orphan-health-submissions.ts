/**
 * 답변이 없는 건강검진 제출 건 정리 (양식 필드 재생성 시 답변이 삭제된 경우)
 * 실행: npx tsx scripts/cleanup-orphan-health-submissions.ts
 */
import { PrismaClient } from "@prisma/client";
import { HEALTH_CHECK_FORM_SLUG } from "../src/lib/healthCheck";

const prisma = new PrismaClient();

async function main() {
  const form = await prisma.form.findFirst({ where: { slug: HEALTH_CHECK_FORM_SLUG } });
  if (!form) {
    console.log("건강검진 양식 없음");
    return;
  }

  const subs = await prisma.formSubmission.findMany({
    where: { formId: form.id },
    include: { _count: { select: { answers: true } } },
  });

  const orphans = subs.filter((s) => s._count.answers === 0);
  if (orphans.length === 0) {
    console.log("✅ 답변 없는 제출 건 없음");
    return;
  }

  const deleted = await prisma.formSubmission.deleteMany({
    where: { id: { in: orphans.map((s) => s.id) } },
  });
  console.log(`✅ 답변 없는 제출 ${deleted.count}건 삭제 완료 (재신청 필요)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

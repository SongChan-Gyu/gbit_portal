/**
 * 운영 오픈 전 정리 스크립트 (테스트 데이터 삭제)
 *
 * UI: 관리자 → 시스템 설정 → 운영 초기화 탭 에서 동일 작업 가능.
 *
 * 안전장치:
 * - 기본은 DRY RUN(삭제 안 함)
 * - 실제 삭제는 CONFIRM_WIPE=WIPE 를 명시해야 함
 *
 * 실행 예시:
 *   DATABASE_URL="mysql://..." npx tsx scripts/production-wipe.ts
 *   KEEP_USERNAMES="admin,pm" npx tsx scripts/production-wipe.ts
 *   CONFIRM_WIPE=WIPE KEEP_USERNAMES="admin,pm" npx tsx scripts/production-wipe.ts
 */

import prisma from "../src/lib/db";
import {
  executeProductionWipe,
  getProductionWipePreview,
  parseKeepUsernamesFromInput,
} from "../src/lib/productionWipe";

async function main() {
  const raw = process.env.KEEP_USERNAMES?.trim();
  const keep = raw ? parseKeepUsernamesFromInput(raw) : ["admin", "pm"];

  const isWipe = (process.env.CONFIRM_WIPE ?? "").trim() === "WIPE";
  const modeLabel = isWipe ? "WIPE" : "DRY_RUN";

  console.log(`[production-wipe] mode=${modeLabel}`);
  console.log(`[production-wipe] keep usernames=${keep.join(", ")}`);

  const { counts } = await getProductionWipePreview(keep);
  console.log("[production-wipe] preview counts:", counts);

  if (!isWipe) {
    console.log(
      '[production-wipe] DRY_RUN 완료. 실제 삭제하려면 CONFIRM_WIPE=WIPE 로 다시 실행하세요.'
    );
    return;
  }

  console.log("[production-wipe] 삭제 시작...");
  const { keep: kept } = await executeProductionWipe(keep);
  console.log("[production-wipe] ✅ 삭제 완료. 남은 계정:", kept.join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

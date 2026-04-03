#!/bin/sh
set -e
set -u

echo "[start:prod] prisma migrate deploy"
prisma migrate deploy

if [ "${RUN_RESET_LEAVE_TEST_DATA_ONCE:-1}" = "1" ]; then
  echo "[start:prod] one-time leave reset enabled"
  CONFIRM_WIPE=RESET_LEAVE npx tsx scripts/reset-leave-test-data.ts
  echo "[start:prod] unify old AM/PM leave types"
  CONFIRM_MIGRATE=UNIFY_LEAVE_TYPES npx tsx scripts/migrate-leave-types-timeslot-unify.ts
  echo "[start:prod] delete old AM/PM leave type variants"
  CONFIRM_DELETE=DELETE_LEAVE_TYPE_VARIANTS npx tsx scripts/delete-variant-leave-types.ts
else
  echo "[start:prod] one-time leave reset disabled"
fi

echo "[start:prod] backfill stamp cards"
npx tsx scripts/backfill-stamp-cards.ts

echo "[start:prod] prisma db seed"
npx prisma db seed

echo "[start:prod] encrypt employee PII (phone/email) - 이미 암호화된 값은 자동 스킵"
npx tsx scripts/encrypt-employee-pii.ts

echo "[start:prod] next start"
next start

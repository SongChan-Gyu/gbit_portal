#!/bin/sh
# MySQL이 실제로 접속 가능할 때까지 대기 후 마이그레이션·시드·dev 실행
set -e
# Docker 안에서는 반드시 mysql 호스트 사용 (.env의 127.0.0.1 무시)
export DATABASE_URL="${DATABASE_URL:-mysql://root:hrm_secret@mysql:3306/hrm_web}"
echo "[docker] Waiting for MySQL to accept connections..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if npx prisma migrate deploy 2>/dev/null; then
    echo "[docker] MySQL ready, running seed..."
    npx prisma db seed || true
    echo "[docker] Starting dev server..."
    exec npm run dev -- --hostname 0.0.0.0
  fi
  echo "[docker] Attempt $i/10 failed, retrying in 3s..."
  sleep 3
done
echo "[docker] Could not connect to MySQL after 10 attempts."
exit 1

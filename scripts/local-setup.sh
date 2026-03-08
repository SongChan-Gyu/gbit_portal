#!/bin/bash
# 로컬 MySQL 기준으로 DB 생성 + 마이그레이션 + 시드 한 번에
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/4] .env 확인..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  .env 생성함. DATABASE_URL 비밀번호를 맥 MySQL root 비밀번호에 맞게 수정한 뒤 다시 실행하세요."
  exit 1
fi

# DATABASE_URL에서 비밀번호 추출 (mysql://user:PASS@host 형식)
URL=$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
rest="${URL#*://}"; rest="${rest#*:}"; DB_PASS="${rest%%@*}"
if [ -z "$DB_PASS" ]; then
  echo "MySQL root 비밀번호를 입력하세요:"
  read -r DB_PASS
fi

echo "[2/4] DB 생성 시도..."
if mysql -u root -h 127.0.0.1 -p"$DB_PASS" -e "CREATE DATABASE IF NOT EXISTS hrm_web;" 2>/dev/null; then
  echo "  hrm_web DB 확인됨."
else
  echo "  비밀번호가 틀렸거나 MySQL이 꺼져 있을 수 있습니다."
  echo "  .env 의 DATABASE_URL 비밀번호를 맥 MySQL root 비밀번호로 바꾸고, MySQL 실행 중인지 확인한 뒤 다시 실행하세요."
  exit 1
fi

echo "[3/4] Prisma generate & migrate..."
npx prisma generate
npx prisma migrate deploy

echo "[4/4] 시드..."
npx prisma db seed || true

echo ""
echo "설정 끝. 다음으로 실행하세요: npm run dev"
echo "  또는: npm run dev:local"

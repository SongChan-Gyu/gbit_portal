#!/usr/bin/env bash
# Docker MySQL 기동 후 Prisma 마이그레이션 적용
# 사용: ./scripts/mysql-up-and-migrate.sh  또는  bash scripts/mysql-up-and-migrate.sh

set -e
cd "$(dirname "$0")/.."

echo ">>> Docker Compose로 MySQL 기동..."
docker compose up -d

echo ">>> MySQL 준비 대기 중 (최대 60초)..."
for i in {1..60}; do
  if docker compose exec -T mysql mysqladmin ping -h localhost -u root -p"${MYSQL_ROOT_PASSWORD:-hrm_secret}" --silent 2>/dev/null; then
    echo ">>> MySQL 준비됨."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo ">>> MySQL 기동 시간 초과. docker compose logs mysql 로 확인하세요."
    exit 1
  fi
  sleep 1
done

echo ">>> Prisma 마이그레이션 적용..."
npx prisma migrate dev --name init_mysql

echo ">>> 완료. 필요 시: npm run db:seed 또는 npm run db:seed:base"

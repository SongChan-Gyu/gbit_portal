#!/bin/sh
# dev: start server only if not already running on port 3000
cd "$(dirname "$0")/.." || exit 1

if lsof -i :3000 >/dev/null 2>&1; then
  echo "개발 서버가 이미 실행 중입니다 (port 3000)."
  exit 0
fi

exec npx next dev

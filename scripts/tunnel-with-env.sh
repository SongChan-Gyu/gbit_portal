#!/usr/bin/env bash
# Cloudflare Quick Tunnel 실행 후 생성된 URL을 .env.local의 NEXTAUTH_URL에 자동 반영
# 사용법: ./scripts/tunnel-with-env.sh  (또는 npm run tunnel)
# 선행: npm run dev 로 로컬 서버 실행 중이어야 함

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_LOCAL="$PROJECT_ROOT/.env.local"
LOG_FILE="${TMPDIR:-/tmp}/hrm-cloudflared-$$.log"

cd "$PROJECT_ROOT"

if ! command -v cloudflared &>/dev/null; then
  echo "cloudflared가 설치되어 있지 않습니다. 설치: brew install cloudflared"
  exit 1
fi

echo "Cloudflare Tunnel 시작 중... (로그: $LOG_FILE)"
cloudflared tunnel --url http://localhost:3000 > "$LOG_FILE" 2>&1 &
TUNNEL_PID=$!

# URL이 로그에 나타날 때까지 대기 (최대 15초)
for i in $(seq 1 15); do
  sleep 1
  TUNNEL_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1)
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "타임아웃: 터널 URL을 찾지 못했습니다. 로그 확인: $LOG_FILE"
  kill $TUNNEL_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "터널 URL: $TUNNEL_URL"
echo ""

# .env.local에 NEXTAUTH_URL 반영 (있으면 교체, 없으면 추가)
if [[ -f "$ENV_LOCAL" ]]; then
  if grep -q '^NEXTAUTH_URL=' "$ENV_LOCAL" 2>/dev/null; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=\"$TUNNEL_URL\"|" "$ENV_LOCAL"
    else
      sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=\"$TUNNEL_URL\"|" "$ENV_LOCAL"
    fi
  else
    echo "NEXTAUTH_URL=\"$TUNNEL_URL\"" >> "$ENV_LOCAL"
  fi
  echo "✓ .env.local 의 NEXTAUTH_URL 을 위 URL로 갱신했습니다."
  echo "  Next.js 개발 서버가 이미 떠 있다면 한 번 재시작해 주세요 (환경변수 반영)."
else
  echo "NEXTAUTH_URL=\"$TUNNEL_URL\"" > "$ENV_LOCAL"
  echo "✓ .env.local 을 생성하고 NEXTAUTH_URL 을 설정했습니다."
fi

echo ""
echo "터널이 백그라운드에서 실행 중입니다 (PID: $TUNNEL_PID). 종료하려면: kill $TUNNEL_PID"
echo ""

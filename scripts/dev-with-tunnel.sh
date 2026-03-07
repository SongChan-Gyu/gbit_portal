#!/usr/bin/env bash
# Dev server + ngrok tunnel
# Usage: npm run dev:tunnel
# Ctrl+C to stop both

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DEV_PID=""
NGROK_PID=""

cleanup() {
  echo ""
  echo "Stopping..."
  [ -n "$DEV_PID" ] && kill "$DEV_PID" 2>/dev/null || true
  [ -n "$NGROK_PID" ] && kill "$NGROK_PID" 2>/dev/null || true
  pkill -f "ngrok http" 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

echo ">> Starting Next.js dev server..."
npm run dev &
DEV_PID=$!

echo "   Waiting for server..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200\|307\|304"; then
    echo "   OK Server ready (localhost:3000)"
    break
  fi
  sleep 1
  if [ $i -eq 30 ]; then
    echo "   Timeout."
    kill $DEV_PID 2>/dev/null || true
    exit 1
  fi
done

if ! command -v ngrok &>/dev/null; then
  echo "   ngrok not found. Run: brew install ngrok && ngrok config add-authtoken <token>"
  wait $DEV_PID
  exit 0
fi

echo ">> Starting ngrok tunnel..."
ngrok http 3000 --log=stdout > "${TMPDIR:-/tmp}/hrm-ngrok-$$.log" 2>&1 &
NGROK_PID=$!

TUNNEL_URL=""
for i in $(seq 1 25); do
  sleep 0.5
  JSON=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null || true)
  if [ -n "$JSON" ]; then
    TUNNEL_URL=$(echo "$JSON" | grep -oE 'https://[a-zA-Z0-9.-]+\.ngrok[^"]*' | head -1)
    [ -n "$TUNNEL_URL" ] && break
  fi
done

if [ -n "$TUNNEL_URL" ]; then
  echo ""
  echo "   Tunnel URL: $TUNNEL_URL"
  ENV_LOCAL="$PROJECT_ROOT/.env.local"
  if [ -f "$ENV_LOCAL" ]; then
    if grep -q '^NEXTAUTH_URL=' "$ENV_LOCAL" 2>/dev/null; then
      if [ "$(uname)" = "Darwin" ]; then
        sed -i '' "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=\"$TUNNEL_URL\"|" "$ENV_LOCAL"
      else
        sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=\"$TUNNEL_URL\"|" "$ENV_LOCAL"
      fi
    else
      echo "NEXTAUTH_URL=\"$TUNNEL_URL\"" >> "$ENV_LOCAL"
    fi
    echo "   .env.local NEXTAUTH_URL updated"
  else
    echo "NEXTAUTH_URL=\"$TUNNEL_URL\"" > "$ENV_LOCAL"
  fi
  echo ""
else
  echo "   ngrok URL timeout (run: ngrok config add-authtoken <token>)"
fi

echo "----------------------------------------"
echo "  Local:  http://localhost:3000"
echo "  Tunnel: ${TUNNEL_URL:-waiting...}"
echo "  Stop:   Ctrl+C"
echo "----------------------------------------"
echo ""

wait $DEV_PID

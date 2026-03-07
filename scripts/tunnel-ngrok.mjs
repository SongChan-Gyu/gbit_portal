#!/usr/bin/env node
/**
 * ngrok으로 로컬 서버(기본 3000) 노출 + NEXTAUTH_URL 자동 반영.
 * IP 입력 없이 링크만 공유하면 됨 (다른 사람한테 테스트 페이지 보여주기용).
 *
 * 사전: https://ngrok.com 가입 후
 *   brew install ngrok
 *   ngrok config add-authtoken <토큰>
 *
 * 사용: node scripts/tunnel-ngrok.mjs
 * 선행: npm run dev 실행 중
 */

import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const ENV_LOCAL = resolve(PROJECT_ROOT, ".env.local");
const PORT = Number(process.env.PORT) || 3000;
const NGROK_API = "http://127.0.0.1:4040/api/tunnels";

function runNgrok() {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("ngrok", ["http", String(PORT)], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    child.unref();
    child.on("error", (err) => rejectPromise(err));
    child.stderr?.on("data", () => {});
    // ngrok이 준비되면 4040에서 API 열림
    resolvePromise(child);
  });
}

async function fetchNgrokUrl() {
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(NGROK_API);
      if (!res.ok) continue;
      const data = await res.json();
      const tunnels = data.tunnels || [];
      const https = tunnels.find((t) => t.public_url?.startsWith("https://"));
      if (https?.public_url) return https.public_url;
    } catch (_) {}
  }
  return null;
}

async function main() {
  console.log(`ngrok 시작 중 (localhost:${PORT})...`);
  await runNgrok();
  const url = await fetchNgrokUrl();
  if (!url) {
    console.error("ngrok URL을 가져오지 못했습니다. ngrok이 설치·로그인되어 있는지 확인하세요.");
    console.error("  brew install ngrok");
    console.error("  ngrok config add-authtoken <토큰>");
    process.exit(1);
  }

  console.log("");
  console.log("터널 URL (이 링크만 공유하면 됨, IP 입력 없음):", url);
  console.log("");

  const setOrReplace = (content) => {
    if (content.includes("NEXTAUTH_URL=")) {
      return content.replace(/^NEXTAUTH_URL=.*/m, `NEXTAUTH_URL="${url}"`);
    }
    return content + `\nNEXTAUTH_URL="${url}"\n`;
  };

  if (existsSync(ENV_LOCAL)) {
    const content = readFileSync(ENV_LOCAL, "utf8");
    writeFileSync(ENV_LOCAL, setOrReplace(content), "utf8");
  } else {
    writeFileSync(ENV_LOCAL, `NEXTAUTH_URL="${url}"\n`, "utf8");
  }
  console.log("✓ .env.local 의 NEXTAUTH_URL 을 위 URL로 갱신했습니다.");
  console.log("  Next.js 서버가 이미 떠 있다면 한 번 재시작해 주세요.");
  console.log("");
  console.log("ngrok이 백그라운드에서 실행 중입니다. 종료하려면: pkill ngrok");
  console.log("");
}

main().catch((err) => {
  if (err.code === "ENOENT") {
    console.error("ngrok을 찾을 수 없습니다. 설치: brew install ngrok");
  } else {
    console.error(err);
  }
  process.exit(1);
});

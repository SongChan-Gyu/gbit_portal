/**
 * HRM 자동 스케줄러 (node-cron 기반)
 * Windows / macOS / Linux 모두 동일한 코드로 동작합니다.
 *
 * 실행 방법 (공통):
 *   npm run cron
 *   또는: node cron-runner.mjs
 *
 * 서버 시작 시 자동 실행 (OS별):
 *
 * [Windows] 작업 스케줄러
 *   1. 작업 스케줄러 → 기본 작업 만들기 → "시작 시" 트리거
 *   2. 프로그램: node.exe
 *   3. 인수: 프로젝트 경로\cron-runner.mjs  (예: D:\app\hrm-web\cron-runner.mjs)
 *   4. 시작 위치: 프로젝트 경로
 *
 * [macOS / Linux] systemd (권장, Linux 서버) 또는 launchd (macOS)
 *   systemd 예시: /etc/systemd/system/hrm-cron.service
 *     [Unit]
 *     Description=HRM cron runner
 *     After=network.target
 *     [Service]
 *     Type=simple
 *     User=deploy
 *     WorkingDirectory=/home/deploy/hrm-web
 *     ExecStart=/usr/bin/node cron-runner.mjs
 *     Restart=always
 *     RestartSec=10
 *     [Install]
 *     WantedBy=multi-user.target
 *   실행: sudo systemctl enable hrm-cron && sudo systemctl start hrm-cron
 *
 *   macOS launchd: LaunchAgent plist에서 WorkingDirectory를 프로젝트로, ProgramArguments에 node, cron-runner.mjs 지정
 *
 * 환경 변수 (.env 또는 .env.local):
 *   NEXT_PUBLIC_APP_URL=http://localhost:3000
 *   CRON_SECRET=your-secret-key  (API 보안 키)
 */

import cron from "node-cron";

const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

function log(msg) {
  const now = new Date().toLocaleString("ko-KR", { timeZone:"Asia/Seoul" });
  console.log(`[${now}] ${msg}`);
}

async function callApi(path, body) {
  const url = `${APP_URL}${path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CRON_SECRET ? { "x-cron-secret": CRON_SECRET } : {}),
      },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

// ─────────────────────────────────────────────────────
// 1. 매월 1일 오전 0시 10분 — 월별 연차 적립
// ─────────────────────────────────────────────────────
cron.schedule("10 0 1 * *", async () => {
  log("▶ 월별 연차 적립 시작");
  const result = await callApi("/api/cron/monthly-accrual", {});
  if (result.error) {
    log(`  ❌ 실패: ${result.error}`);
  } else {
    log(`  ✅ 완료: 부여 ${result.granted}건, 건너뜀 ${result.skipped}건, 오류 ${result.errors}건`);
    if (result.detail?.granted?.length > 0) {
      result.detail.granted.forEach(g =>
        log(`     → ${g.name} ${g.month} +${g.days}일`)
      );
    }
  }
}, { timezone: "Asia/Seoul" });

// ─────────────────────────────────────────────────────
// 2. 매일 오전 0시 15분 — 근속 기념일 체크
// ─────────────────────────────────────────────────────
cron.schedule("15 0 * * *", async () => {
  log("▶ 근속 기념일 체크 시작");
  const today = new Date().toISOString().slice(0, 10);
  const result = await callApi("/api/cron/tenure-check", { date: today, window: 0 });
  if (result.error) {
    log(`  ❌ 실패: ${result.error}`);
  } else if (result.granted === 0) {
    log(`  ℹ️  오늘 기념일 없음 (건너뜀 ${result.skipped}건)`);
  } else {
    log(`  ✅ 부여 ${result.granted}건`);
    result.detail?.granted?.forEach(g =>
      log(`     → ${g.name} ${g.code} ${g.anniversary} +${g.days}일`)
    );
  }
}, { timezone: "Asia/Seoul" });

// ─────────────────────────────────────────────────────
// 3. 앱 시작 시 오늘 날짜로 한 번 즉시 실행 (선택)
// ─────────────────────────────────────────────────────
(async () => {
  log("━━━ HRM 스케줄러 시작 ━━━");
  log(`  앱 URL: ${APP_URL}`);
  log("  예약 작업:");
  log("    - 매월 1일 00:10 → 월별 연차 적립");
  log("    - 매일   00:15 → 근속 기념일 체크");
  log("  Ctrl+C 로 종료\n");
})();

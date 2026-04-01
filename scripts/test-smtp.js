#!/usr/bin/env node
/**
 * SMTP 연결/발송 테스트 (터미널에서 에러 확인용)
 * 사용: node scripts/test-smtp.js [수신이메일]
 * 프로젝트 루트에서 실행 ( .env.local / .env 자동 로드 )
 */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
for (const f of [".env.local", ".env"]) {
  const p = path.join(root, f);
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const to = process.argv[2] || "test@example.com";

async function main() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  console.log("SMTP 설정:", { host, port: process.env.SMTP_PORT, user, from, to });
  if (!host || !user || !pass) {
    console.error("SMTP_HOST, SMTP_USER, SMTP_PASS 가 필요합니다.");
    process.exit(1);
  }

  const nodemailer = await import("nodemailer");
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);

  const transporter = nodemailer.default.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `"GBIT Portal" <${from}>`,
      to,
      subject: "[테스트] SMTP 발송 확인",
      text: "이 메일이 보이면 SMTP 설정이 정상입니다.",
    });
    console.log("발송 성공:", to);
  } catch (e) {
    console.error("발송 실패:", e.message);
    if (e.response) console.error("서버 응답:", e.response);
    process.exit(1);
  }
}

main();

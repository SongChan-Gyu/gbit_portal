/**
 * 로컬 SMTP 점검: 프로젝트 루트 .env 로드 후 sendMail 1통.
 * 실행: npx tsx scripts/test-smtp.ts
 * 수신만 바꾸려면: SMTP_TEST_TO=다른@주소 npx tsx scripts/test-smtp.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === "") process.env[key] = val;
  }
}

loadDotEnv();

async function main() {
  const { sendMail } = await import("../src/lib/email");
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const to = process.env.SMTP_TEST_TO || from;
  if (!to?.includes("@")) {
    console.error("SMTP_FROM / SMTP_USER / SMTP_TEST_TO 중 수신 가능한 이메일이 없습니다.");
    process.exit(1);
  }
  await sendMail({
    to,
    subject: "[GBIT Portal] SMTP 로컬 테스트",
    text: `발송 시각: ${new Date().toISOString()}\n로컬 nodemailer 점검입니다.`,
  });
  console.log("OK → 발송 완료:", to);
}

main().catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  if (e && typeof e === "object" && "response" in e) {
    console.error("SMTP 응답:", (e as { response?: string }).response);
  }
  process.exit(1);
});

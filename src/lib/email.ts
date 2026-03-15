/**
 * 이메일 발송 (SMTP)
 * - 발송만 하므로 SMTP만 사용. POP3는 수신용이라 미사용.
 * - 환경변수: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM(선택)
 * - 네이버: smtp.naver.com, 포트 465(SSL), 비밀번호는 애플리케이션 비밀번호.
 *
 * TEST_EMAIL_OVERRIDE 설정 시: 발신(from)·수신(to) 모두 해당 주소로 강제 (로컬/클라우드 공통).
 */

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(options: SendMailOptions): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("이메일 발송이 설정되지 않았습니다. (SMTP_HOST, SMTP_USER, SMTP_PASS 확인)");
  }

  const override = process.env.TEST_EMAIL_OVERRIDE?.trim();
  const to = override || options.to;
  const from = override || process.env.SMTP_FROM || user;

  const nodemailer = await import("nodemailer");
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);

  const transporter = nodemailer.default.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: typeof from === "string" && from.includes("<") ? from : `"GBIT Portal" <${from}>`,
    to,
    subject: options.subject,
    text: options.text,
    html: options.html ?? options.text.replace(/\n/g, "<br/>"),
  });
}

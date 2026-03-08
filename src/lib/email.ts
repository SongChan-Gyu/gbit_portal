/**
 * 이메일 발송 (SMTP)
 * 환경변수: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM(선택)
 * 미설정 시 sendMail이 에러를 던집니다.
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

  const nodemailer = await import("nodemailer");
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const from = process.env.SMTP_FROM ?? user;

  const transporter = nodemailer.default.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: typeof from === "string" && from.includes("<") ? from : `"GBIT Portal" <${from}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html ?? options.text.replace(/\n/g, "<br/>"),
  });
}

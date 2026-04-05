/**
 * 이메일 발송 (SMTP)
 * - 발송만 하므로 SMTP만 사용. POP3는 수신용이라 미사용.
 * - 환경변수: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM(선택)
 * - 465: SSL(secure: true). 587: STARTTLS(requireTLS) 자동 적용.
 * - 네이버: smtp.naver.com, 포트 465(SSL), 비밀번호는 애플리케이션 비밀번호.
 *
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

  const to = options.to;
  const from = process.env.SMTP_FROM || user;

  const nodemailer = await import("nodemailer");
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const secure = port === 465;
  /** 587 등: 명시적 STARTTLS (일부 클라우드·호스팅에서 TLS 누락 시 연결 실패 완화) */
  const requireTLS = !secure && port !== 25;

  const transporter = nodemailer.default.createTransport({
    host,
    port,
    secure,
    requireTLS,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: typeof from === "string" && from.includes("<") ? from : `"GBIT Portal" <${from}>`,
      to,
      subject: options.subject,
      text: options.text,
      html: options.html ?? options.text.replace(/\n/g, "<br/>"),
    });
  } catch (e) {
    console.error("[email] sendMail failed:", e instanceof Error ? e.message : e);
    throw e;
  }
}

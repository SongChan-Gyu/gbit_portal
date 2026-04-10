/**
 * 이메일 발송
 *
 * 우선순위
 * 1) RESEND_API_KEY가 있으면 Resend HTTP API(443) 사용
 * 2) 없으면 SMTP 사용
 *
 * 공통 권장
 * - MAIL_FROM 또는 SMTP_FROM: 발신 주소 (예: gbit@gbitportal.co.kr)
 *
 * SMTP 환경변수
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM(선택)
 * - 465: SSL(secure: true). 587: STARTTLS(requireTLS) 자동 적용.
 */

export interface SendMailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(options: SendMailOptions): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.MAIL_FROM?.trim() || process.env.SMTP_FROM?.trim() || "";

  if (resendKey) {
    if (!fromAddress) {
      throw new Error("메일 발신 주소가 없습니다. (MAIL_FROM 또는 SMTP_FROM 설정 필요)");
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress.includes("<") ? fromAddress : `"GBIT Portal" <${fromAddress}>`,
        to: [options.to],
        subject: options.subject,
        text: options.text,
        html: options.html ?? options.text.replace(/\n/g, "<br/>"),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      throw new Error(`Resend API 실패 (${res.status}): ${raw.slice(0, 500)}`);
    }
    return;
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("이메일 발송이 설정되지 않았습니다. (SMTP_HOST, SMTP_USER, SMTP_PASS 확인)");
  }

  const to = options.to;
  const from = fromAddress || user;

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

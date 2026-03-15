/**
 * 회사 정형식 이메일 레이아웃 (발송 메일 공통 포맷)
 * - 상단: 서비스명·한 줄 안내
 * - 본문: 각 발송 기능에서 전달한 HTML
 * - 하단: 회사명·문의 안내
 */

const COMPANY_NAME = "지비아이티";
const PORTAL_NAME = "GBIT Portal";
const FOOTER_TEXT = "본 메일은 시스템에서 자동 발송되었습니다. 문의사항은 담당자에게 연락해 주세요.";

export function wrapEmailBody(contentHtml: string, options?: { title?: string }) {
  const title = options?.title ?? PORTAL_NAME;
  return `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; font-size: 14px; line-height: 1.6; color: #374151;">
  <div style="max-width: 560px; margin: 0 auto; padding: 24px 20px;">
    <!-- 헤더 -->
    <div style="border-bottom: 2px solid #1e40af; padding-bottom: 12px; margin-bottom: 20px;">
      <div style="font-weight: 700; font-size: 18px; color: #1e40af;">${PORTAL_NAME}</div>
      <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">${COMPANY_NAME}</div>
    </div>
    <!-- 본문 -->
    <div style="min-height: 80px;">
      ${contentHtml}
    </div>
    <!-- 푸터 -->
    <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
      ${FOOTER_TEXT}<br>
      © ${new Date().getFullYear()} ${COMPANY_NAME}
    </div>
  </div>
</body>
</html>
  `.trim();
}

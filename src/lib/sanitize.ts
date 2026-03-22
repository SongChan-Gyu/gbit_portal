import DOMPurify from "isomorphic-dompurify";

/**
 * XSS 방지를 위한 HTML sanitize.
 * 공지 내용, RichText 출력 등 사용자·관리자 입력 HTML 렌더 시 사용.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (dirty == null || typeof dirty !== "string") return "";
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
      "a", "img", "span", "div", "table", "thead", "tbody", "tr", "th", "td",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "title", "class", "style"],
    ALLOW_DATA_ATTR: false,
  });
}

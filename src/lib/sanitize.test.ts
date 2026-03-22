import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("빈 값은 빈 문자열", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(undefined)).toBe("");
  });

  it("안전한 HTML은 유지", () => {
    expect(sanitizeHtml("<p>hello</p>")).toContain("hello");
    expect(sanitizeHtml("<strong>굵게</strong>")).toContain("굵게");
    expect(sanitizeHtml("<a href='https://x.com'>링크</a>")).toContain("링크");
  });

  it("script 태그 제거", () => {
    const dirty = "<p>안녕</p><script>alert(1)</script>";
    expect(sanitizeHtml(dirty)).not.toContain("script");
    expect(sanitizeHtml(dirty)).not.toContain("alert");
  });

  it("onclick 등 이벤트 핸들러 제거", () => {
    const dirty = '<img src="x" onerror="alert(1)">';
    expect(sanitizeHtml(dirty)).not.toContain("onerror");
  });
});

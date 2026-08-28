import { describe, expect, it } from "vitest";
import { DEFAULT_JEJU_NOTICE_ITEMS, sanitizeJejuNoticeItems } from "./jejuNoticeItems";

describe("jejuNoticeItems", () => {
  it("sanitizes and trims notice items", () => {
    expect(sanitizeJejuNoticeItems(["  첫 번째  ", "두 번째"])).toEqual(["첫 번째", "두 번째"]);
  });

  it("rejects empty list", () => {
    expect(() => sanitizeJejuNoticeItems([])).toThrow();
    expect(() => sanitizeJejuNoticeItems(["", "  "])).toThrow();
  });

  it("has default seed items", () => {
    expect(DEFAULT_JEJU_NOTICE_ITEMS.length).toBeGreaterThan(0);
  });
});

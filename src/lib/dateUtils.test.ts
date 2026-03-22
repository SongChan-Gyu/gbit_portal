import { describe, it, expect } from "vitest";
import { addDaysYMD, toYMD, formatMDWithDay } from "./dateUtils";

describe("addDaysYMD", () => {
  it("n일을 더한 날짜를 반환한다", () => {
    expect(addDaysYMD("2025-05-01", 1)).toBe("2025-05-02");
    expect(addDaysYMD("2025-05-01", 30)).toBe("2025-05-31");
    expect(addDaysYMD("2025-05-31", 1)).toBe("2025-06-01");
    expect(addDaysYMD("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("음수 n이면 이전 날짜", () => {
    expect(addDaysYMD("2025-05-15", -5)).toBe("2025-05-10");
  });
});

describe("toYMD", () => {
  it("Date를 YYYY-MM-DD 문자열로 변환", () => {
    const d = new Date(2025, 4, 15); // 2025-05-15 (월 0-based)
    expect(toYMD(d)).toBe("2025-05-15");
  });
});

describe("formatMDWithDay", () => {
  it("월/일(요일) 형식", () => {
    expect(formatMDWithDay("2025-05-01")).toMatch(/\d{1,2}\/\d{1,2}\([일월화수목금토]\)/);
  });
});

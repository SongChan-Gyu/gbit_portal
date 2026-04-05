import { describe, it, expect } from "vitest";
import {
  calcAnnualDays,
  fiscalPeriod,
  getTenureMilestones,
  fiscalMonthIndex,
} from "./leaveCalc";
import { kstYmd } from "./dateUtils";

describe("calcAnnualDays", () => {
  it("프리랜서는 항상 15일", () => {
    const hireDate = new Date("2020-01-01");
    const fyStart = new Date("2025-05-01");
    expect(calcAnnualDays(hireDate, fyStart, "FREE")).toBe(15);
  });

  it("정규직 1년 미만은 0 (월별 발생)", () => {
    const hireDate = new Date("2025-06-01");
    const fyStart = new Date("2025-05-01");
    expect(calcAnnualDays(hireDate, fyStart, "FULL")).toBe(0);
  });

  it("정규직 기본 15일 + 2년마다 1일", () => {
    const fyStart = new Date("2025-05-01");
    const hire2y = new Date("2023-05-01"); // 2년
    const hire4y = new Date("2021-05-01"); // 4년
    expect(calcAnnualDays(hire2y, fyStart, "FULL")).toBe(16);
    expect(calcAnnualDays(hire4y, fyStart, "FULL")).toBe(17);
  });

  it("최대 25일", () => {
    const fyStart = new Date("2025-05-01");
    const hireLong = new Date("2000-01-01"); // 25년+
    expect(calcAnnualDays(hireLong, fyStart, "FULL")).toBe(25);
  });
});

describe("fiscalPeriod", () => {
  it("귀속연도 2025 → KST 달력 2025-05-01 ~ 2026-04-30", () => {
    const { start, end } = fiscalPeriod(2025);
    expect(kstYmd(start)).toBe("2025-05-01");
    expect(kstYmd(end)).toBe("2026-04-30");
  });
});

describe("fiscalMonthIndex", () => {
  it("5월 = 0, 4월 = 11 (KST 달력)", () => {
    expect(fiscalMonthIndex(new Date("2025-05-01T12:00:00+09:00"), 2025)).toBe(0);
    expect(fiscalMonthIndex(new Date("2026-04-30T12:00:00+09:00"), 2025)).toBe(11);
  });
});

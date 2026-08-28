import { describe, expect, it } from "vitest";
import {
  JEJU_YEARLY_USAGE_LIMIT,
  buildJejuYearlyUsageInfo,
  canSubmitJejuInCalendarYear,
  formatJejuYearlyUsageLimitError,
  formatJejuYearlyUsageLimitHint,
  getJejuYearlyUsageLimit,
  isJejuUnlimitedEmployee,
} from "./jejuYearStats";

describe("jejuYearStats yearly usage limit", () => {
  const stats = (submittedCount: number) => ({
    year: 2026,
    submittedCount,
    approvedStayInYearCount: 0,
  });

  it("treats internal director as unlimited", () => {
    const internalDirector = { position: "이사", employeeType: "FULL" };
    expect(isJejuUnlimitedEmployee(internalDirector)).toBe(true);
    expect(getJejuYearlyUsageLimit(internalDirector)).toBeNull();
    expect(canSubmitJejuInCalendarYear(stats(99), internalDirector)).toBe(true);
  });

  it("still limits external developers even when position is director", () => {
    const externalDirector = { position: "이사", employeeType: "EXTERNAL" };
    expect(isJejuUnlimitedEmployee(externalDirector)).toBe(false);
    expect(getJejuYearlyUsageLimit(externalDirector)).toBe(JEJU_YEARLY_USAGE_LIMIT);
    expect(canSubmitJejuInCalendarYear(stats(2), externalDirector)).toBe(false);
  });

  it("limits non-director employees to two submissions per year", () => {
    const staff = { position: "사원", employeeType: "FULL" };
    expect(getJejuYearlyUsageLimit(staff)).toBe(JEJU_YEARLY_USAGE_LIMIT);
    expect(canSubmitJejuInCalendarYear(stats(0), staff)).toBe(true);
    expect(canSubmitJejuInCalendarYear(stats(1), staff)).toBe(true);
    expect(canSubmitJejuInCalendarYear(stats(2), staff)).toBe(false);
  });

  it("builds usage info and hints", () => {
    const staff = { position: "대리", employeeType: "FULL" };
    const atLimit = buildJejuYearlyUsageInfo(stats(2), staff);
    expect(atLimit.canSubmit).toBe(false);
    expect(atLimit.remaining).toBe(0);
    expect(atLimit.hint).toContain("한도");

    const oneLeft = buildJejuYearlyUsageInfo(stats(1), staff);
    expect(oneLeft.canSubmit).toBe(true);
    expect(oneLeft.remaining).toBe(1);
    expect(formatJejuYearlyUsageLimitHint(2026, stats(1), staff)).toContain("남은 신청 1회");
  });

  it("formats limit error message", () => {
    expect(formatJejuYearlyUsageLimitError(2026)).toContain("연 2회");
    expect(formatJejuYearlyUsageLimitError(2026)).toContain("내부 직원 이사");
  });
});

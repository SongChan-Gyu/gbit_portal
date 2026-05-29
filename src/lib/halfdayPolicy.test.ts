import { describe, expect, it } from "vitest";
import {
  halfdayApplicationDeadlineYmd,
  isPmHalfDayHolidayWednesdaySelection,
  isTeamHalfWeeklyLimitExceeded,
  isValidPmHalfDayLeaveYmd,
  weekStartYmdFromYmd,
  wouldExceedTeamHalfWeeklyLimit,
} from "./halfdayPolicy";

describe("isValidPmHalfDayLeaveYmd", () => {
  const holidays = new Set(["2026-05-06"]); // 수요일 공휴일 가정

  it("영업일 수요일 허용", () => {
    expect(isValidPmHalfDayLeaveYmd("2026-05-13", holidays)).toBe(true);
  });

  it("휴일 수요일 불가", () => {
    expect(isValidPmHalfDayLeaveYmd("2026-05-06", holidays)).toBe(false);
  });

  it("전날이 휴일 수요일인 목요일 허용", () => {
    expect(isValidPmHalfDayLeaveYmd("2026-05-07", holidays)).toBe(true);
  });

  it("일반 목요일 불가", () => {
    expect(isValidPmHalfDayLeaveYmd("2026-05-14", holidays)).toBe(false);
  });
});

describe("isPmHalfDayHolidayWednesdaySelection", () => {
  it("휴일 수요일만 true", () => {
    const holidays = new Set(["2026-05-06"]);
    expect(isPmHalfDayHolidayWednesdaySelection("2026-05-06", holidays)).toBe(true);
    expect(isPmHalfDayHolidayWednesdaySelection("2026-05-07", holidays)).toBe(false);
  });
});

describe("halfdayApplicationDeadlineYmd", () => {
  it("첫 수요일이 휴일이면 목요일 마감", () => {
    const holidays = new Set(["2026-05-06"]);
    expect(halfdayApplicationDeadlineYmd(2026, 5, holidays)).toBe("2026-05-07");
  });
});

describe("team half weekly limit", () => {
  it("월요일 주 시작", () => {
    expect(weekStartYmdFromYmd("2026-05-20")).toBe("2026-05-18"); // 수 → 그 주 월
  });

  it("4명 초과 시 5번째 차단", () => {
    expect(wouldExceedTeamHalfWeeklyLimit(["a", "b", "c", "d"], "e")).toBe(true);
    expect(wouldExceedTeamHalfWeeklyLimit(["a", "b", "c", "d"], "a")).toBe(false);
  });

  it("주별 맵으로 초과 판단", () => {
    const byWeek = { "2026-05-18": ["e1", "e2", "e3", "e4"] };
    expect(isTeamHalfWeeklyLimitExceeded("2026-05-20", "e5", byWeek)).toBe(true);
    expect(isTeamHalfWeeklyLimitExceeded("2026-05-20", "e1", byWeek)).toBe(false);
  });
});

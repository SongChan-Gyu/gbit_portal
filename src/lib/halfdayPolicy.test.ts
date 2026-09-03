import { describe, expect, it } from "vitest";
import {
  anyHealingHalfReplaceMonthAvailable,
  canApplyHealingHalfReplaceInMonth,
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

describe("canApplyHealingHalfReplaceInMonth", () => {
  it("하프데이 없음·대기·승인과 무관하게 해당 월 힐링 미사용이면 가능", () => {
    // 하프데이 사용량은 인자로 받지 않음 — PENDING/APPROVED/없음 모두 동일하게 통과
    expect(canApplyHealingHalfReplaceInMonth("2026-09", {})).toBe(true);
  });

  it("해당 월 힐링이 이미 있으면 불가", () => {
    expect(canApplyHealingHalfReplaceInMonth("2026-09", { "2026-09": 1 })).toBe(false);
  });

  it("다른 달 사용은 이번 달에 영향 없음", () => {
    expect(canApplyHealingHalfReplaceInMonth("2026-09", { "2026-08": 1 })).toBe(true);
  });
});

describe("anyHealingHalfReplaceMonthAvailable", () => {
  it("이번 달 미사용이면 선택지 노출", () => {
    expect(anyHealingHalfReplaceMonthAvailable("2026-09-15", {})).toBe(true);
  });

  it("이번 달 사용이면 말주가 아니면 숨김", () => {
    expect(anyHealingHalfReplaceMonthAvailable("2026-09-15", { "2026-09": 1 })).toBe(false);
  });

  it("말주에 이번 달 사용이어도 다음 달 미사용이면 노출", () => {
    expect(anyHealingHalfReplaceMonthAvailable("2026-09-28", { "2026-09": 1 })).toBe(true);
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

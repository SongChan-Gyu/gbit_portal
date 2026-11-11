import { describe, expect, it } from "vitest";
import {
  isJejuCheckoutDelayLocked,
  jejuCheckoutDelayHoursLabel,
  jejuCheckoutTimeLabel,
  parseCheckoutDelayHours,
} from "./jejuCheckoutDelay";

describe("isJejuCheckoutDelayLocked", () => {
  const endDate = new Date("2026-11-12T00:00:00+09:00");
  it("퇴실 전날까지는 변경 가능", () => {
    expect(isJejuCheckoutDelayLocked(endDate, "2026-11-11")).toBe(false);
  });
  it("퇴실일 당일과 이후에는 잠긴다", () => {
    expect(isJejuCheckoutDelayLocked(endDate, "2026-11-12")).toBe(true);
    expect(isJejuCheckoutDelayLocked(endDate, "2026-11-13")).toBe(true);
  });
});

describe("parseCheckoutDelayHours", () => {
  it("0~3만 허용", () => {
    expect(parseCheckoutDelayHours(0)).toBe(0);
    expect(parseCheckoutDelayHours(1)).toBe(1);
    expect(parseCheckoutDelayHours("2")).toBe(2);
    expect(parseCheckoutDelayHours(3)).toBe(3);
    expect(parseCheckoutDelayHours(4)).toBeNull();
    expect(parseCheckoutDelayHours(-1)).toBeNull();
    expect(parseCheckoutDelayHours("")).toBeNull();
  });
});

describe("jejuCheckoutTimeLabel", () => {
  it("기본 11:00, 지연만큼 시각을 더한다", () => {
    expect(jejuCheckoutTimeLabel(0)).toBe("11:00");
    expect(jejuCheckoutTimeLabel(1)).toBe("12:00");
    expect(jejuCheckoutTimeLabel(2)).toBe("13:00");
    expect(jejuCheckoutTimeLabel(3)).toBe("14:00");
    expect(jejuCheckoutTimeLabel(9)).toBe("11:00");
  });
});

describe("jejuCheckoutDelayHoursLabel", () => {
  it("0~3시간을 그대로 표기한다", () => {
    expect(jejuCheckoutDelayHoursLabel(0)).toBe("0시간");
    expect(jejuCheckoutDelayHoursLabel(1)).toBe("1시간");
    expect(jejuCheckoutDelayHoursLabel(2)).toBe("2시간");
    expect(jejuCheckoutDelayHoursLabel(3)).toBe("3시간");
  });
});

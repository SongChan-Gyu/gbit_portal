import { describe, expect, it } from "vitest";
import {
  pickAllocationByRemainingPeriod,
  sortAllocationsByRemainingPeriod,
} from "./leaveAllocationPool";

describe("sortAllocationsByRemainingPeriod", () => {
  it("만료일이 가까운 할당을 앞에 둔다", () => {
    const sorted = sortAllocationsByRemainingPeriod([
      { id: "late", validFrom: "2026-01-01", validUntil: "2026-12-31" },
      { id: "soon", validFrom: "2026-03-01", validUntil: "2026-06-30" },
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["soon", "late"]);
  });

  it("만료일이 같으면 부여일이 빠른 쪽을 앞에 둔다", () => {
    const sorted = sortAllocationsByRemainingPeriod([
      { id: "newer", validFrom: "2026-04-01", validUntil: "2026-12-31" },
      { id: "older", validFrom: "2026-01-01", validUntil: "2026-12-31" },
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["older", "newer"]);
  });
});

describe("pickAllocationByRemainingPeriod", () => {
  const coversAll = () => true;

  it("잔여가 충분하면 만료가 가까운 할당을 고른다", () => {
    const picked = pickAllocationByRemainingPeriod(
      [
        { id: "late", validFrom: "2026-01-01", validUntil: "2026-12-31" },
        { id: "soon", validFrom: "2026-03-01", validUntil: "2026-06-30" },
      ],
      { late: 2, soon: 1 },
      1,
      coversAll,
    );
    expect(picked?.id).toBe("soon");
  });

  it("만료가 가까워도 잔여가 부족하면 다음 할당을 고른다", () => {
    const picked = pickAllocationByRemainingPeriod(
      [
        { id: "soon", validFrom: "2026-03-01", validUntil: "2026-06-30" },
        { id: "late", validFrom: "2026-01-01", validUntil: "2026-12-31" },
      ],
      { soon: 0.5, late: 2 },
      1,
      coversAll,
    );
    expect(picked?.id).toBe("late");
  });
});

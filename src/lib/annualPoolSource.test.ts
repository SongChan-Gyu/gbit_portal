import { describe, expect, it } from "vitest";
import { leaveTypeDedicatedSourceCode, leaveTypeUsesAnnualPool } from "./annualPoolSource";

describe("leaveTypeUsesAnnualPool", () => {
  it("기본연차에 연결된 연차는 근속·이월을 포함한 연차 풀로 차감한다", () => {
    const annual = { deductFromBalance: true, allocationSourceCode: "BASE_ANNUAL" };
    expect(leaveTypeUsesAnnualPool(annual)).toBe(true);
    expect(leaveTypeDedicatedSourceCode(annual)).toBeNull();
  });

  it("할당 코드가 없는 잔여 차감 유형도 연차 풀이다", () => {
    const legacy = { deductFromBalance: true, allocationSourceCode: null };
    expect(leaveTypeUsesAnnualPool(legacy)).toBe(true);
    expect(leaveTypeDedicatedSourceCode(legacy)).toBeNull();
  });

  it("돌봄·대체 같은 전용 부여는 연차 풀에서 빼지 않는다", () => {
    const care = { deductFromBalance: false, allocationSourceCode: "CARE" };
    const compensatory = { deductFromBalance: true, allocationSourceCode: "COMPENSATORY" };
    expect(leaveTypeUsesAnnualPool(care)).toBe(false);
    expect(leaveTypeDedicatedSourceCode(care)).toBe("CARE");
    expect(leaveTypeUsesAnnualPool(compensatory)).toBe(false);
    expect(leaveTypeDedicatedSourceCode(compensatory)).toBe("COMPENSATORY");
  });
});

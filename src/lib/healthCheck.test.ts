import { describe, expect, it } from "vitest";
import {
  applyHealthCheckLockedAnswers,
  healthCheckBlankFieldError,
  healthCheckLockedFieldValues,
} from "./healthCheck";

const fields = [
  { id: "name", label: "성명" },
  { id: "empNo", label: "사원번호" },
  { id: "rel", label: "직원과의 관계" },
  { id: "relName", label: "관계임직원 성명 (본인인 경우 공란)" },
  { id: "notes", label: "특이사항" },
];

describe("healthCheckLockedFieldValues", () => {
  it("사원번호 칸만 공란으로 잠근다", () => {
    expect(healthCheckLockedFieldValues(fields)).toEqual({
      empNo: "",
    });
  });
});

describe("applyHealthCheckLockedAnswers", () => {
  it("클라이언트가 사원번호를 넣어도 공란으로 덮는다", () => {
    const next = applyHealthCheckLockedAnswers(fields, { name: "김민재", empNo: "조작값" });
    expect(next.empNo).toBe("");
  });
});

describe("healthCheckBlankFieldError", () => {
  it("사원번호와 특이사항은 비워도 통과한다", () => {
    expect(
      healthCheckBlankFieldError(fields, {
        name: "김민재",
        empNo: "",
        rel: "본인",
        relName: "",
        notes: "",
      }),
    ).toBeNull();
  });

  it("특이사항을 입력해도 통과한다", () => {
    expect(
      healthCheckBlankFieldError(fields, {
        name: "김민재",
        empNo: "",
        rel: "본인",
        relName: "",
        notes: "야간근무",
      }),
    ).toBeNull();
  });

  it("성명이 비면 막는다", () => {
    expect(
      healthCheckBlankFieldError(fields, {
        name: "",
        empNo: "",
        rel: "본인",
        notes: "",
      }),
    ).toContain("성명");
  });
});

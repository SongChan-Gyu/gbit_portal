import { describe, expect, it } from "vitest";
import {
  EXPORT_HEADERS,
  EXTERNAL_DEFAULT_HIRE_YMD,
  buildEmployeeExportSheetRows,
  employeeExportFilename,
} from "./employeeExcel";

describe("사원정보 엑셀 다운로드", () => {
  it("헤더와 한글 표시 행을 만든다", () => {
    const rows = buildEmployeeExportSheetRows([
      {
        empNo: "E001",
        companyStaffNo: "200410",
        name: "홍길동",
        teamName: "1팀",
        position: "과장",
        dutyDept: "OPERATIONS",
        hireDate: new Date("2010-03-01T00:00:00+09:00"),
        birthDate: new Date("1988-05-20T00:00:00+09:00"),
        phone: "010-1111-2222",
        email: "hong@example.com",
        employeeType: "FULL",
        role: "STAFF",
        status: "ACTIVE",
        username: "200410",
      },
    ]);
    expect(rows[0]).toEqual([...EXPORT_HEADERS]);
    expect(rows[1][0]).toBe("E001");
    expect(rows[1][1]).toBe("200410");
    expect(rows[1][2]).toBe("홍길동");
    expect(rows[1][3]).toBe("1팀");
    expect(rows[1][5]).toBe("운영부");
    expect(rows[1][10]).toBe("정규직");
    expect(rows[1][11]).toBe("팀원");
    expect(rows[1][12]).toBe("재직");
    expect(rows[1][13]).toBe("200410");
  });

  it("외부개발자 기본 입사일은 빈 칸으로 둔다", () => {
    const rows = buildEmployeeExportSheetRows([
      {
        empNo: "E099",
        companyStaffNo: null,
        name: "외부인",
        teamName: null,
        position: "사원",
        dutyDept: null,
        hireDate: new Date(`${EXTERNAL_DEFAULT_HIRE_YMD}T00:00:00+09:00`),
        birthDate: null,
        phone: "010-0000-0000",
        email: null,
        employeeType: "EXTERNAL",
        role: "STAFF",
        status: "PENDING",
        username: null,
      },
    ]);
    expect(rows[1][6]).toBe("");
    expect(rows[1][10]).toBe("외부개발자");
    expect(rows[1][12]).toBe("미초대");
  });

  it("파일명은 사원정보_날짜.xlsx", () => {
    expect(employeeExportFilename("2026-09-10")).toBe("사원정보_2026-09-10.xlsx");
    expect(employeeExportFilename("2026-09-10", { brief: true })).toBe("사원정보_간략_2026-09-10.xlsx");
    expect(employeeExportFilename("2026-09-10", { brief: true, externalOnly: true })).toBe(
      "사원정보_간략_외부개발자_2026-09-10.xlsx",
    );
  });

  it("간략 모드는 사번·이름·생년월일만 넣는다", () => {
    const rows = buildEmployeeExportSheetRows(
      [
        {
          empNo: "E001",
          companyStaffNo: "200410",
          name: "홍길동",
          teamName: "1팀",
          position: "과장",
          dutyDept: "OPERATIONS",
          hireDate: new Date("2010-03-01T00:00:00+09:00"),
          birthDate: new Date("1988-05-20T00:00:00+09:00"),
          phone: "010-1111-2222",
          email: "hong@example.com",
          employeeType: "FULL",
          role: "STAFF",
          status: "ACTIVE",
          username: "200410",
        },
      ],
      { brief: true },
    );
    expect(rows[0]).toEqual(["사번", "이름", "생년월일"]);
    expect(rows[1]).toEqual(["E001", "홍길동", "1988-05-20"]);
  });

  it("외부개발자 체크 시 외부개발자만 넣는다", () => {
    const internal = {
      empNo: "E001",
      companyStaffNo: "200410",
      name: "홍길동",
      teamName: "1팀",
      position: "과장",
      dutyDept: "OPERATIONS",
      hireDate: new Date("2010-03-01T00:00:00+09:00"),
      birthDate: new Date("1988-05-20T00:00:00+09:00"),
      phone: "010-1111-2222",
      email: "hong@example.com",
      employeeType: "FULL",
      role: "STAFF",
      status: "ACTIVE",
      username: "200410",
    };
    const external = {
      ...internal,
      empNo: "E099",
      name: "외부인",
      employeeType: "EXTERNAL",
      birthDate: new Date("1990-01-02T00:00:00+09:00"),
    };
    const rows = buildEmployeeExportSheetRows([internal, external], {
      brief: true,
      externalOnly: true,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["사번", "이름", "생년월일"]);
    expect(rows[1]).toEqual(["E099", "외부인", "1990-01-02"]);
  });
});

import { describe, expect, it } from "vitest";
import { buildHealthCheckExportDataRow } from "./healthCheckExport";

describe("buildHealthCheckExportDataRow", () => {
  it("사원번호는 엑셀에 공란으로 넣는다", () => {
    const row = buildHealthCheckExportDataRow({
      index: 1,
      name: "김민재",
      rrn7: "900101-1",
      phone: "010-1234-5678",
      empNo: "110232",
      relatedEmployeeName: "",
      relationship: "본인",
      storedTotalLabel: "32만원",
    });
    expect(row[4]).toBe("");
  });

  it("특이사항을 엑셀 마지막 칸에 넣는다", () => {
    const row = buildHealthCheckExportDataRow({
      index: 1,
      name: "김민재",
      rrn7: "900101-1",
      phone: "010-1234-5678",
      empNo: "110232",
      relatedEmployeeName: "",
      relationship: "본인",
      storedTotalLabel: "32만원",
      notes: "야간근무",
    });
    expect(row[4]).toBe("");
    expect(row[12]).toBe("야간근무");
  });

  it("특이사항이 없으면 공란이다", () => {
    const row = buildHealthCheckExportDataRow({
      index: 1,
      name: "김민재",
      rrn7: "900101-1",
      phone: "010-1234-5678",
      empNo: "110232",
      relatedEmployeeName: "",
      relationship: "본인",
      storedTotalLabel: "32만원",
    });
    expect(row[4]).toBe("");
    expect(row[12]).toBe("");
  });
});

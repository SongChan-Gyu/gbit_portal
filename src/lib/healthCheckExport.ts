/** 건강검진 엑셀 명단 양식(2026년도_지비아이티_검진대상자.xlsx) 기준 */

import { todayKstYmd } from "@/lib/dateUtils";

export const HEALTH_CHECK_MGMT_FEE = 20_000;
export const HEALTH_CHECK_BILLING_DEFAULT = "회사지원";

/** 엑셀 컬럼 헤더(1행) — 상단 안내문·빈 행 없이 바로 데이터 입력 */
export const HEALTH_CHECK_EXPORT_COLUMN_HEADER: (string | number)[] = [
  "구분",
  "*성명",
  "*주민번호 7자리\n(성별포함)",
  "*전화번호",
  "사원번호",
  "부서",
  "관계임직원 성명\n(본인인 경우 공란)",
  "직원과의\n관계",
  "*검진지원금액",
  "*건강관리서비스 이용료",
  "*총액",
  "*청구",
  "특이사항",
];

const EXPORT_COL_COUNT = HEALTH_CHECK_EXPORT_COLUMN_HEADER.length;

/** "32만원" → 320000 */
export function parseKoreanManWonAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const manMatch = trimmed.match(/(\d+)\s*만\s*원?/);
  if (manMatch) return parseInt(manMatch[1], 10) * 10_000;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function healthCheckAmountsFromStoredTotal(storedTotalLabel: string) {
  const total = parseKoreanManWonAmount(storedTotalLabel);
  if (total == null) {
    return { examSupport: null as number | null, mgmtFee: HEALTH_CHECK_MGMT_FEE, total: null as number | null };
  }
  return {
    examSupport: total - HEALTH_CHECK_MGMT_FEE,
    mgmtFee: HEALTH_CHECK_MGMT_FEE,
    total,
  };
}

export function findHealthCheckSupportAmountLabel(byLabel: Record<string, string>): string {
  const key = Object.keys(byLabel).find((k) => k.includes("검진") && k.includes("지원"));
  return key ? byLabel[key] ?? "" : "";
}

export type HealthCheckExportRowInput = {
  index: number;
  name: string;
  rrn7: string;
  phone: string;
  empNo: string;
  relatedEmployeeName: string;
  relationship: string;
  storedTotalLabel: string;
};

export function buildHealthCheckExportDataRow(input: HealthCheckExportRowInput): (string | number)[] {
  const row: (string | number)[] = Array(EXPORT_COL_COUNT).fill("");
  const { examSupport, mgmtFee, total } = healthCheckAmountsFromStoredTotal(input.storedTotalLabel);

  row[0] = input.index;
  row[1] = input.name;
  row[2] = input.rrn7;
  row[3] = input.phone;
  row[4] = input.empNo;
  row[5] = ""; // 부서: 공란
  row[6] = input.relatedEmployeeName;
  row[7] = input.relationship;
  if (examSupport != null) row[8] = examSupport;
  row[9] = mgmtFee;
  if (total != null) row[10] = total;
  row[11] = HEALTH_CHECK_BILLING_DEFAULT;
  row[12] = ""; // 특이사항: 공란

  return row;
}

export function buildHealthCheckExportSheetRows(
  submissions: HealthCheckExportRowInput[],
): (string | number)[][] {
  return [
    HEALTH_CHECK_EXPORT_COLUMN_HEADER,
    ...submissions.map((s) => buildHealthCheckExportDataRow(s)),
  ];
}

/** 다운로드 파일명: 건강검진_YYYY-MM-DD.xlsx */
export function healthCheckExportFilename(dateYmd = todayKstYmd()): string {
  return `건강검진_${dateYmd}.xlsx`;
}

/** 브라우저 호환 Content-Disposition (ASCII fallback + UTF-8) */
export function healthCheckExportDisposition(dateYmd = todayKstYmd()): string {
  const filenameKo = healthCheckExportFilename(dateYmd);
  const filenameAscii = `health_check_${dateYmd}.xlsx`;
  return `attachment; filename="${filenameAscii}"; filename*=UTF-8''${encodeURIComponent(filenameKo)}`;
}

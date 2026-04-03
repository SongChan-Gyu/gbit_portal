/**
 * 사원 엑셀 일괄 등록 양식
 * - 1행: 헤더(아래 TEMPLATE_HEADERS 순서)
 * - 2행~: 데이터. 사번은 비워두면 자동 부여됨.
 */
export const TEMPLATE_HEADERS = [
  "이름",
  "팀",
  "직급",
  "직급부서",
  "입사일",
  "생년월일",
  "연락처",
  "이메일",
  "고용유형",
  "역할",
] as const;

/** 직급: 사원, 대리, 과장, 차장, 부장, 이사 (한글 그대로 저장) */
export const POSITION_OPTIONS = ["사원", "대리", "과장", "차장", "부장", "이사"] as const;

/** 직급부서: 엑셀에는 한글 또는 코드 입력 가능 */
export const DUTY_DEPT_MAP: Record<string, string> = {
  "": "",
  "운영부": "OPERATIONS",
  "교육부": "EDUCATION",
  "복지부": "WELFARE",
  "해당사항없음": "NONE",
  "OPERATIONS": "OPERATIONS",
  "EDUCATION": "EDUCATION",
  "WELFARE": "WELFARE",
  "NONE": "NONE",
};

/** 코드 → 한글 (미리보기/표시용) */
export const DUTY_DEPT_TO_LABEL: Record<string, string> = {
  OPERATIONS: "운영부",
  EDUCATION: "교육부",
  WELFARE: "복지부",
  NONE: "해당사항없음",
};

/** 직무부서 코드 목록 (귀속연도 초기화 등에서 사용) */
export const DUTY_DEPT_CODES = ["OPERATIONS", "EDUCATION", "WELFARE"] as const;
export type DutyDeptCode = (typeof DUTY_DEPT_CODES)[number];

export const ROLE_MAP: Record<string, string> = {
  "": "STAFF",
  "팀원": "STAFF",
  "팀장": "TEAM_LEAD",
  "PM": "PM",
  "관리자": "ADMIN",
  "STAFF": "STAFF",
  "TEAM_LEAD": "TEAM_LEAD",
  "ADMIN": "ADMIN",
};

export const ROLE_TO_LABEL: Record<string, string> = {
  STAFF: "팀원",
  TEAM_LEAD: "팀장",
  PM: "PM",
  ADMIN: "관리자",
};

export const EMPLOYEE_TYPE_MAP: Record<string, string> = {
  "": "FULL",
  "정규직": "FULL",
  "프리랜서": "FREE",
  "외부개발자": "EXTERNAL",
  "FULL": "FULL",
  "FREE": "FREE",
  "EXTERNAL": "EXTERNAL",
};

/** 고용유형 코드 → 한글. 외부개발자는 휴가 관리 없음, 제주 숙소 등만 가능 */
export const EMPLOYEE_TYPE_TO_LABEL: Record<string, string> = {
  FULL: "정규직",
  FREE: "프리랜서",
  EXTERNAL: "외부개발자",
};

export interface ParsedEmployeeRow {
  _rowIndex: number;
  empNo: string; // 비어 있으면 import 시 자동 부여
  name: string;
  team: string;
  position: string; // 직급: 사원/대리/과장/차장/부장/이사
  dutyDept: string;
  hireDate: string;
  birthDate: string;
  phone: string;
  email: string;
  employeeType: string;
  role: string;
}

/** 엑셀 시리얼 날짜(숫자) → YYYY-MM-DD */
function excelDateToStr(n: number): string {
  const d = new Date((n - 25569) * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

/** 셀 값을 문자열로 (날짜는 YYYY-MM-DD) */
function cellStr(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number") {
    if (val > 30000) return excelDateToStr(val);
    return String(val);
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).trim();
}

/** 엑셀 시트(첫 시트)의 배열 행을 ParsedEmployeeRow[]로 변환. 헤더는 1행으로 가정 */
export function parseSheetToRows(
  rows: unknown[][],
  headers: readonly string[] = TEMPLATE_HEADERS
): { rows: ParsedEmployeeRow[]; errors: string[] } {
  const errors: string[] = [];
  const result: ParsedEmployeeRow[] = [];
  if (!rows.length) return { rows: [], errors: ["데이터 행이 없습니다."] };

  const headerRow = rows[0].map((c) => cellStr(c));
  const colIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    colIndex[h] = headerRow.indexOf(h);
    if (colIndex[h] === -1) colIndex[h] = i;
  });
  ["사번", "직위"].forEach((h) => {
    if (colIndex[h] === undefined) colIndex[h] = headerRow.indexOf(h);
  });

  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i] as unknown[];
    const get = (key: string) => {
      const idx = colIndex[key] ?? headers.indexOf(key);
      return idx >= 0 && raw[idx] != null ? cellStr(raw[idx]) : "";
    };
    const name = get("이름");
    const position = (get("직급") || get("직위")).trim();
    const hireDate = get("입사일");
    if (!name && !position && !hireDate) continue;
    if (!name) {
      errors.push(`${i + 1}행: 이름이 비어 있습니다.`);
      continue;
    }
    if (!position) {
      errors.push(`${i + 1}행: 직급이 비어 있습니다.`);
      continue;
    }
    if (!hireDate) {
      errors.push(`${i + 1}행: 입사일이 비어 있습니다.`);
      continue;
    }
    const dutyDept = (DUTY_DEPT_MAP[get("직급부서")] ?? get("직급부서")) || "";
    const role = (ROLE_MAP[get("역할")] ?? get("역할")) || "STAFF";
    const employeeType = (EMPLOYEE_TYPE_MAP[get("고용유형")] ?? get("고용유형")) || "FULL";
    result.push({
      _rowIndex: i + 1,
      empNo: get("사번") || "", // 비어 있으면 import-confirm에서 자동 부여
      name,
      team: get("팀"),
      position,
      dutyDept,
      hireDate,
      birthDate: get("생년월일"),
      phone: get("연락처"),
      email: get("이메일"),
      employeeType,
      role,
    });
  }
  return { rows: result, errors };
}

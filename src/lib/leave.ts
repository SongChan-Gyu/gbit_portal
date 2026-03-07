/**
 * 휴가 관련 비즈니스 로직
 */

/** 귀속연도 계산 (5월 1일 기준) */
export function getFiscalYear(date: Date = new Date()): number {
  const m = date.getMonth() + 1; // 1~12
  const y = date.getFullYear();
  return m >= 5 ? y : y - 1;
}

/** 귀속연도 기간 반환 */
export function getFiscalPeriod(fiscalYear: number) {
  return {
    start: new Date(`${fiscalYear}-05-01T00:00:00`),
    end: new Date(`${fiscalYear + 1}-04-30T23:59:59`),
  };
}

/** 입사일 기준 연차 기본 일수 계산 */
export function calcAnnualDays(
  hireDate: Date,
  fiscalYear: number,
  employeeType: string
): number {
  if (employeeType === "FREE") return 15; // 프리랜서 고정

  const fiscalStart = new Date(`${fiscalYear}-05-01`);
  const hireDateNorm = new Date(hireDate);

  // 입사일 1~5일이면 월말 입사로 간주
  if (hireDateNorm.getDate() <= 5) {
    hireDateNorm.setDate(1);
  }

  const yearsWorked = Math.floor(
    (fiscalStart.getTime() - hireDateNorm.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  );

  if (yearsWorked < 1) return 0; // 1년 미만: 월별 1일씩 (별도 처리)
  // 기본 15일, 2년마다 1일 가산, 최대 25일
  const extra = Math.floor((yearsWorked - 1) / 2);
  return Math.min(15 + extra, 25);
}

/** 영업일 수 계산 (공휴일 배열 포함) */
export function calcWorkingDays(
  start: Date,
  end: Date,
  holidays: Date[]
): number {
  let count = 0;
  const cur = new Date(start);
  const holidaySet = new Set(holidays.map((h) => h.toISOString().slice(0, 10)));
  while (cur <= end) {
    const dow = cur.getDay();
    const ds = cur.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(ds)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** 날짜 포맷 (YYYY-MM-DD) */
export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 귀속연도 표시 문자열 */
export function fiscalYearLabel(fy: number): string {
  return `${fy}.05 ~ ${fy + 1}.04`;
}

/** 역할 한글 */
export const ROLE_LABELS: Record<string, string> = {
  STAFF: "직원",
  TEAM_LEAD: "팀장",
  PM: "PM",
  ADMIN: "관리자",
};

/** 직급 한글 정렬 순서 */
export const POSITION_ORDER = ["이사", "부장", "차장", "과장", "대리", "사원"];

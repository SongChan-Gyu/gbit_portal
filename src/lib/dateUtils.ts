/**
 * 일자 정보 통일: 모든 날짜 연산·비교는 YYYY-MM-DD 문자열 사용.
 * - todayYMD(): 오늘 날짜 (로컬 기준)
 * - addDaysYMD(ymd, n): ymd에 n일 더한 YYYY-MM-DD (UTC 기준 연산, 타임존 영향 없음)
 * - toYMD(date): Date → YYYY-MM-DD (로컬 날짜 기준, 표시/입력용)
 */

/** 오늘 날짜 YYYY-MM-DD (로컬) */
export function todayYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD에 n일 더한 날짜 (타임존 무관, 연산만 UTC 사용) */
export function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Date → YYYY-MM-DD (로컬 날짜 기준) */
export function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 상대 시간 표현 (예: "3분 전", "2시간 전", "어제")
 */
export function formatDistanceToNow(dateStr: string | Date): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;
  return formatMDWithDay(date);
}

/**
 * 날짜를 "2025년 4월 1일 (화)" 형식으로 표시
 */
export function formatDateKo(dateStr: string | Date): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
}

/**
 * 날짜를 "2025-04-01" 형식으로 표시
 */
export function formatDateISO(dateStr: string | Date): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return date.toISOString().split("T")[0];
}

const DAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** 월/일 + 요일 (앞자리 0 없음): 5/1(수) */
export function formatMDWithDay(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const w = DAYS_KO[d.getDay()];
  return `${m}/${day}(${w})`;
}

/** YYYY-MM-DD 문자열을 로컬 달력 기준으로 파싱해 M/D(요) 표시 (타임존 이슈 방지) */
export function formatMDWithDayFromYMD(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return formatMDWithDay(new Date(y, m - 1, d));
}

/** YYYY-MM-DD의 요일 인덱스 (0=일 … 3=수 … 6=토), 로컬 달력 기준 */
export function weekdayIndexFromYMD(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d).getDay();
}

/** 하프데이 등: 수요일(3) 여부 */
export function isWednesdayYMD(ymd: string): boolean {
  return weekdayIndexFromYMD(ymd) === 3;
}

/** 연도 포함 (요일 없음): 2025/4/30 — 유효기간 등 */
export function formatYMD(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}/${m}/${day}`;
}

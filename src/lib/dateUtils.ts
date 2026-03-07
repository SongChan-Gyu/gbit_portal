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

/** 연도 포함 (요일 없음): 2025/4/30 — 유효기간 등 */
export function formatYMD(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}/${m}/${day}`;
}

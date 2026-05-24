/** 알림톡·관리 화면용 제출 유효기간 라벨 (KST) */
export function formatFormSubmitDeadlineLabel(deadline: Date | null | undefined): string {
  if (!deadline) return "별도 공지 예정";
  return deadline.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** API·datetime-local 입력 → Date | null */
export function parseFormSubmitDeadlineInput(raw: unknown): Date | null {
  if (raw == null || String(raw).trim() === "") return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** DB Date → `<input type="datetime-local">` 값 (KST 표시) */
export function formSubmitDeadlineToInputValue(deadline: Date | null | undefined): string {
  if (!deadline) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(deadline);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * 일자·타임존 정책 (GBIT 포털 = 한국 업무 기준)
 *
 * - **달력 YYYY-MM-DD 문자열**: 구간 순회·영업일·요일(문자열 기준)은 `addDaysYMD` + `calendarUtcDowFromYMD`
 *   (ISO 문자열 파싱/서버 TZ에 의존하지 않음).
 * - **DB의 DateTime·브라우저 Date → 날짜 문자열**: `kstYmd` / `todayKstYmd` (Asia/Seoul 달력일).
 * - **금지**: 업무일 기준으로 `new Date("YYYY-MM-DD")`, `date.toISOString().slice(0,10)` 단독 사용
 *   (미국 등 서버 TZ에서 하루 밀림).
 *
 * - `todayYMD` / `toYMD`는 하위 호환 별칭으로 **KST 달력**과 동일하게 동작한다 (`kstYmd` / `todayKstYmd` 아래에 정의).
 */

/** YYYY-MM-DD에 n일 더한 날짜 (타임존 무관, 연산만 UTC 사용) */
export function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * 입사일 등 달력 YYYY-MM-DD에 주년을 더한 날짜 (한국 달력 기준, 말일 클램프).
 * toISOString().slice(0,10) 대신 사용해 근속 기념일·중복 판정이 UTC로 하루 밀리는 것을 막는다.
 */
export function addCalendarYearsToYmd(ymd: string, yearsToAdd: number): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return ymd.slice(0, 10);
  const targetY = y + yearsToAdd;
  const maxDay = new Date(targetY, m, 0).getDate();
  const day = Math.min(d, maxDay);
  return `${targetY}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "YYYY-MM" → 다음 달 "YYYY-MM" */
export function ymNext(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" → 그 달 말일 YYYY-MM-DD (달력, JS Date 말일 규칙) */
export function ymMonthEndYmd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const lastD = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastD).padStart(2, "0")}`;
}

/** 달력 YYYY-MM-DD에 개월 수를 더한 날 (말일 클램프) */
export function addCalendarMonthsToYmd(ymd: string, monthsToAdd: number): string {
  let [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  let nm = m + monthsToAdd;
  while (nm > 12) {
    nm -= 12;
    y++;
  }
  while (nm < 1) {
    nm += 12;
    y--;
  }
  const maxDay = new Date(y, nm, 0).getDate();
  const day = Math.min(d, maxDay);
  return `${y}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 공휴일 테이블(Prisma DateTime) → 한국 달력 YYYY-MM-DD.
 * MySQL DATETIME + toISOString().slice(0,10)만 쓰면 KST 자정이 전날 UTC로 떨어져
 * 5/25 대체공휴일이 5/24로 잡히는 등 연휴연장·영업일 계산이 깨질 수 있음.
 */
export function holidayDateToYmd(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/**
 * 캘린더 YYYY-MM-DD 구간 → UTC DateTime 경계 (Prisma Holiday.date 범위 조회).
 * 서버 프로세스 TZ(미국 등)와 무관하게 같은 달력 구간을 조회한다.
 */
export function ymdRangeUtcBounds(ymdStart: string, ymdEnd: string): { gte: Date; lte: Date } {
  const [ys, ms, ds] = ymdStart.slice(0, 10).split("-").map(Number);
  const [ye, me, de] = ymdEnd.slice(0, 10).split("-").map(Number);
  return {
    gte: new Date(Date.UTC(ys, ms - 1, ds, 0, 0, 0, 0)),
    lte: new Date(Date.UTC(ye, me - 1, de, 23, 59, 59, 999)),
  };
}

/** Date → 한국 달력 YYYY-MM-DD (휴가 일자·할당 유효기간 비교) */
export function kstYmd(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

/** 오늘 날짜 YYYY-MM-DD (한국 달력, 브라우저·서버 모두) */
export function todayKstYmd(): string {
  return kstYmd(new Date());
}

/** 오늘 날짜 YYYY-MM-DD (`todayKstYmd`와 동일, 기존 호출부 호환) */
export function todayYMD(): string {
  return todayKstYmd();
}

/** Date → YYYY-MM-DD (한국 달력, Prisma DateTime·API 응답에 사용) */
export function toYMD(date: Date): string {
  return kstYmd(date);
}

/** [startYmd, endYmd] 닫힌 구간의 모든 날 (달력 문자열 순회, `addDaysYMD`와 동일 축) */
export function eachYmdInInclusiveRange(startYmd: string, endYmd: string): string[] {
  const s = startYmd.slice(0, 10);
  const e = endYmd.slice(0, 10);
  if (!s || !e || s > e) return [];
  const out: string[] = [];
  let cur = s;
  while (cur <= e) {
    out.push(cur);
    cur = addDaysYMD(cur, 1);
  }
  return out;
}

/** [startYmd, endYmd) 반열린 구간 (퇴실일 제외 숙박·예약 점유일 등) */
export function eachYmdInHalfOpenRange(startYmd: string, endYmdExclusive: string): string[] {
  const s = startYmd.slice(0, 10);
  const endEx = endYmdExclusive.slice(0, 10);
  if (!s || !endEx || s >= endEx) return [];
  const out: string[] = [];
  let cur = s;
  while (cur < endEx) {
    out.push(cur);
    cur = addDaysYMD(cur, 1);
  }
  return out;
}

/**
 * 휴가 신청 캘린더 구간 [leaveMinYmd, leaveMaxYmd]와 할당 유효기간이 하루라도 겹치면 true.
 * (DB 조회 좁히기·후보 풀 구성용)
 */
export function allocationOverlapsLeaveYmdRange(
  validFrom: Date,
  validUntil: Date,
  leaveMinYmd: string,
  leaveMaxYmd: string,
): boolean {
  const a0 = kstYmd(validFrom);
  const a1 = kstYmd(validUntil);
  return a0 <= leaveMaxYmd && a1 >= leaveMinYmd;
}

/**
 * 신청 구간 [startYmd, endYmd] 전체가 할당 유효기간(한국 달력) 안에 들어가면 true.
 * (차감·잔여 검증: 그날/그 구간에 이 할당을 쓸 수 있는지)
 */
export function allocationFullyCoversKstYmdRange(
  validFrom: Date,
  validUntil: Date,
  startYmd: string,
  endYmd: string,
): boolean {
  const a0 = kstYmd(validFrom);
  const a1 = kstYmd(validUntil);
  return a0 <= startYmd && a1 >= endYmd;
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
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  });
}

/**
 * 날짜를 "2025-04-01" 형식으로 표시 (한국 달력일)
 */
export function formatDateISO(dateStr: string | Date): string {
  const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  return kstYmd(date);
}

/**
 * YYYY-MM-DD 달력 문자열의 요일 (0=일 … 6=토).
 * `new Date("YYYY-MM-DD")` 파싱·서버 TZ와 무관하게, 문자열 그대로의 달력일 기준(UTC 달력)으로 계산.
 * 영업일 집계(`calcWorkingDays`)와 동일.
 */
export function calendarUtcDowFromYMD(ymd: string): number {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const DOW_KO_CAL = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** YYYY-MM-DD → 요일 한 글자 (달력 문자열·영업일 계산과 동일 축) */
export function dowLabelKoFromYmd(ymd: string): string {
  const i = calendarUtcDowFromYMD(ymd.slice(0, 10));
  return Number.isFinite(i) ? (DOW_KO_CAL[i] ?? "") : "";
}

/**
 * 한국 달력 "오늘" 기준 ±주 이동 후, 그 주의 월~일 YYYY-MM-DD 7칸.
 * (팀 일정 주간 뷰 — 서버·브라우저 로컬 TZ와 무관)
 */
export function kstWeekYmdsForWeekOffset(weekOffset: number, base: Date = new Date()): string[] {
  const today = kstYmd(base);
  const anchorYmd = addDaysYMD(today, weekOffset * 7);
  const dow = calendarUtcDowFromYMD(anchorYmd);
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const mondayYmd = addDaysYMD(anchorYmd, diffToMonday);
  return Array.from({ length: 7 }, (_, i) => addDaysYMD(mondayYmd, i));
}

/** YYYY-MM-DD의 요일 인덱스 — `calendarUtcDowFromYMD`와 동일 (문자열 달력 축) */
export function weekdayIndexFromYMD(ymd: string): number {
  return calendarUtcDowFromYMD(ymd.slice(0, 10));
}

/** 하프데이 등: 수요일(3) 여부 */
export function isWednesdayYMD(ymd: string): boolean {
  return calendarUtcDowFromYMD(ymd.slice(0, 10)) === 3;
}

/** YYYY-MM-DD → M/D(요) (문자열 달력 축) */
export function formatMDWithDayFromYMD(ymd: string): string {
  const t = ymd.slice(0, 10);
  const parts = t.split("-");
  if (parts.length !== 3) return ymd;
  const mm = Number(parts[1]);
  const dd = Number(parts[2]);
  if (!mm || !dd) return ymd;
  const w = dowLabelKoFromYmd(t);
  return `${mm}/${dd}(${w})`;
}

/** Date 또는 문자열 → M/D(요) (DB 시각은 KST 달력일로 변환) */
export function formatMDWithDay(dateStr: string | Date): string {
  if (typeof dateStr === "string") {
    const t = dateStr.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return formatMDWithDayFromYMD(t);
  }
  const ymd = kstYmd(typeof dateStr === "string" ? new Date(dateStr) : dateStr);
  return formatMDWithDayFromYMD(ymd);
}

/** 연도 포함 (요일 없음): 2025/4/30 — 유효기간 등 */
export function formatYMD(dateStr: string | Date): string {
  const d = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const ymd = kstYmd(d);
  const [y, m, day] = ymd.split("-");
  return `${y}/${Number(m)}/${Number(day)}`;
}

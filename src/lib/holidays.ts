/**
 * 공휴일 데이터: 외부 API로 수집 후 DB에 반영
 * - Nager.Date (date.nager.at) 한국 공휴일 사용, API 키 불필요
 * - "다음 귀속년도까지" 커버: 현재 귀속연도 + 1년 (캘린더 기준으로 해당 연도들 수집)
 */

const NAGER_API = "https://date.nager.at/api/v3/PublicHolidays";

export interface HolidayItem {
  date: string; // YYYY-MM-DD
  name: string;
}

/** 한 해 대한민국 공휴일 조회 (Nager.Date API) */
export async function fetchHolidaysForYear(year: number): Promise<HolidayItem[]> {
  const res = await fetch(`${NAGER_API}/${year}/KR`);
  if (!res.ok) throw new Error(`휴일 API 실패: ${res.status} ${res.statusText}`);
  const raw = (await res.json()) as Array<{ date: string; localName: string; name?: string }>;
  const byDate = new Map<string, string>();
  for (const item of raw) {
    const date = item.date; // YYYY-MM-DD
    const name = item.localName || item.name || date;
    if (!byDate.has(date)) byDate.set(date, name);
    else byDate.set(date, `${byDate.get(date)}/${name}`); // 같은 날 여러 명칭
  }
  return Array.from(byDate.entries()).map(([date, name]) => ({ date, name }));
}

/** 여러 연도 휴일 수집 (fromYear ~ toYear 포함) */
export async function fetchHolidays(fromYear: number, toYear: number): Promise<HolidayItem[]> {
  const all: HolidayItem[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    const list = await fetchHolidaysForYear(y);
    all.push(...list);
  }
  return all;
}

/**
 * Nager API에 없는 대체공휴일 등 수동 보강 (한국)
 */
const SUPPLEMENT_HOLIDAYS_KR: HolidayItem[] = [
  { date: "2025-03-02", name: "대체공휴일" },
  { date: "2026-01-02", name: "대체공휴일" },
  { date: "2027-02-10", name: "대체공휴일" },
];

/**
 * DB에 휴일 반영 (upsert). API 결과 + 대체공휴일 보강 반영.
 * - fromYear, toYear: 캘린더 연도 (예: 2025, 2026)
 */
/** holiday.upsert만 사용하므로 raw PrismaClient·확장 DB 모두 허용 */
type HolidayWriter = { holiday: { upsert(args: any): Promise<any> } };

export async function syncHolidaysToDb(
  prisma: HolidayWriter,
  fromYear: number,
  toYear: number
): Promise<{ synced: number; failed?: string }> {
  try {
    const fromApi = await fetchHolidays(fromYear, toYear);
    const byDate = new Map<string, string>();
    for (const { date, name } of fromApi) {
      byDate.set(date, name);
    }
    for (const { date, name } of SUPPLEMENT_HOLIDAYS_KR) {
      const y = parseInt(date.slice(0, 4), 10);
      if (y >= fromYear && y <= toYear) byDate.set(date, name);
    }
    const items = Array.from(byDate.entries()).map(([date, name]) => ({ date, name }));
    let synced = 0;
    for (const { date, name } of items) {
      const d = new Date(date + "T00:00:00Z");
      await prisma.holiday.upsert({
        where: { date: d },
        update: { name },
        create: { date: d, name },
      });
      synced++;
    }
    return { synced };
  } catch (e: any) {
    return { synced: 0, failed: e?.message ?? "휴일 API 오류" };
  }
}

/** 현재·다음 귀속연도를 커버하는 캘린더 연도 범위 (5월 기준 귀속연도) */
export function getHolidayYearRange(): { fromYear: number; toYear: number } {
  const now = new Date();
  const fy = now.getMonth() + 1 >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return { fromYear: fy, toYear: fy + 2 }; // fy년 5월 ~ fy+2년 4월 커버 (fy, fy+1, fy+2 연도 수집)
}

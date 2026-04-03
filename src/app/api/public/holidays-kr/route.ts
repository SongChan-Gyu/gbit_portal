import { NextResponse } from "next/server";
import { fetchHolidaysForYear, mergePublicHolidayYmds } from "@/lib/holidays";

/** 달력 UI용: 해당 연도 Nager 공휴일 + 보강 목록 (DB 동기화 여부와 무관) */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);
  if (Number.isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "invalid year" }, { status: 400 });
  }
  try {
    const items = await fetchHolidaysForYear(year);
    const ymds = items.map((x) => x.date);
    const merged = mergePublicHolidayYmds(ymds);
    return NextResponse.json({ dates: Array.from(merged).sort() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "휴일 조회 실패";
    return NextResponse.json({ error: msg, dates: [] }, { status: 502 });
  }
}

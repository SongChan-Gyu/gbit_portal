import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * 헬스체크 (Railway, 로드밸런서 프로브용).
 * GET /api/health — 200 + { ok, db }
 * db: true = DB 연결 정상, false = DB 연결 실패
 */
export async function GET() {
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    // DB 연결 실패
  }

  const status = dbOk ? 200 : 503;
  return NextResponse.json(
    { ok: dbOk, db: dbOk },
    { status }
  );
}

import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * 요청 로그 기록 (미들웨어에서 호출)
 * Header: x-request-log-secret = REQUEST_LOG_SECRET 과 일치해야 함.
 * body: { method, path, ip }
 */
export async function POST(req: Request) {
  const secret = process.env.REQUEST_LOG_SECRET;
  if (!secret?.trim()) {
    return NextResponse.json({ ok: false, reason: "disabled" }, { status: 200 });
  }
  const headerSecret = req.headers.get("x-request-log-secret");
  if (headerSecret !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { method?: string; path?: string; ip?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const method = String(body.method ?? "GET").slice(0, 16);
  const path = String(body.path ?? "").slice(0, 512);
  const ip = body.ip != null ? String(body.ip).slice(0, 64) : null;

  try {
    await prisma.requestLog.create({
      data: { method, path, ip },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[RequestLog] write failed:", e);
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** API 요청 시 요청 로그 기록 (IP, 메서드, URL). /api/internal/* 제외. */
export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (!pathname.startsWith("/api/") || pathname.startsWith("/api/internal/")) {
    return NextResponse.next();
  }
  if (!process.env.REQUEST_LOG_SECRET?.trim()) {
    return NextResponse.next();
  }

  const method = req.method;
  const path = pathname;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  const base =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (req.headers.get("x-forwarded-proto") && req.headers.get("host")
      ? `${req.headers.get("x-forwarded-proto")}://${req.headers.get("host")}`
      : "http://localhost:3000");

  fetch(`${base}/api/internal/log-request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-log-secret": process.env.REQUEST_LOG_SECRET,
    },
    body: JSON.stringify({ method, path, ip }),
  }).catch(() => {});

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};

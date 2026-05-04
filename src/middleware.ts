import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/** Auth.js v5: HTTPS에서는 `__Secure-authjs.session-token` — getToken에 맞춰야 세션을 읽습니다. */
function isHttpsRequest(req: NextRequest): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first === "https") return true;
    if (first === "http") return false;
  }
  return req.nextUrl.protocol === "https:";
}

function authSecret(): string | undefined {
  return process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/register")) return true;
  if (pathname === "/find-id") return true;
  if (pathname === "/forgot-password") return true;
  if (pathname === "/reset-password") return true;
  if (pathname.startsWith("/jeju-external/")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next/") ||
    pathname === "/_next" ||
    pathname.startsWith("/favicon") ||
    /\.(?:ico|png|jpg|jpeg|svg|gif|webp|txt|xml|webmanifest)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const secret = authSecret();
  const secureCookie = isHttpsRequest(req);
  const token = secret
    ? await getToken({ req, secret, secureCookie })
    : null;

  if (!token) {
    if (!isPublicPath(pathname)) {
      const login = new URL("/login", req.url);
      login.searchParams.set("callbackUrl", `${pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  const mustChange = !!token.mustChangePassword;
  if (mustChange) {
    const forcePw = pathname === "/me" && req.nextUrl.searchParams.get("forcePassword") === "1";
    if (!forcePw) {
      return NextResponse.redirect(new URL("/me?forcePassword=1", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

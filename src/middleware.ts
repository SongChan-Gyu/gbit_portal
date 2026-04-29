import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/register")) return true;
  if (pathname === "/find-id") return true;
  if (pathname === "/forgot-password") return true;
  if (pathname === "/reset-password") return true;
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

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

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

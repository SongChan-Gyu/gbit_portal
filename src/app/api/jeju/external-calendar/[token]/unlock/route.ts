import { NextResponse } from "next/server";
import {
  COOKIE_MAX_AGE_SEC,
  COOKIE_NAME,
  loadJejuExternalStayViewConfig,
  signJejuExternalStayCookie,
  verifyJejuExternalPin,
} from "@/lib/jejuExternalStayView";

function isHttps(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded?.split(",")[0]?.trim() === "https") return true;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const cfg = await loadJejuExternalStayViewConfig();

  if (!cfg.enabled || !cfg.urlToken || cfg.urlToken !== token) {
    await new Promise((r) => setTimeout(r, 350));
    return NextResponse.json({ error: "유효하지 않은 링크입니다." }, { status: 404 });
  }

  if (!cfg.pinHash) {
    return NextResponse.json({ error: "관리자가 아직 비밀번호를 설정하지 않았습니다." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const pin = String(body?.pin ?? "").trim();
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "4자리 숫자를 입력해 주세요." }, { status: 400 });
  }

  const ok = await verifyJejuExternalPin(pin, cfg.pinHash);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 450));
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const signed = signJejuExternalStayCookie(token);
  if (!signed) {
    return NextResponse.json({ error: "서버 시크릿이 설정되지 않아 잠금을 해제할 수 없습니다." }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: COOKIE_NAME,
    value: signed,
    httpOnly: true,
    secure: isHttps(req),
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  });
  return res;
}

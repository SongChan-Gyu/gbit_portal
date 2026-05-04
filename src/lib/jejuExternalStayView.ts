import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";

export const JEJU_EXTERNAL_STAY_CONFIG_KEY = "jejuExternalStayView";

export type JejuExternalStayViewConfig = {
  enabled: boolean;
  /** URL 경로에 쓰이는 비추측 토큰 */
  urlToken: string;
  pinHash: string | null;
};

const COOKIE_NAME = "jeju_ext_stay";
const COOKIE_MAX_AGE_SEC = 12 * 60 * 60; // 12h

export async function loadJejuExternalStayViewConfig(): Promise<JejuExternalStayViewConfig> {
  const row = await prisma.systemConfig.findUnique({ where: { key: JEJU_EXTERNAL_STAY_CONFIG_KEY } });
  if (!row?.value) return { enabled: false, urlToken: "", pinHash: null };
  try {
    const p = JSON.parse(row.value) as Partial<JejuExternalStayViewConfig>;
    return {
      enabled: !!p.enabled,
      urlToken: typeof p.urlToken === "string" && p.urlToken.length >= 16 ? p.urlToken : "",
      pinHash: typeof p.pinHash === "string" && p.pinHash.length > 0 ? p.pinHash : null,
    };
  } catch {
    return { enabled: false, urlToken: "", pinHash: null };
  }
}

function hmacSecret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) return "";
  return `${s}:jeju-external-stay`;
}

export function signJejuExternalStayCookie(urlToken: string): string | null {
  const secret = hmacSecret();
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SEC;
  const payload = JSON.stringify({ t: urlToken, exp });
  const body = Buffer.from(payload, "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyJejuExternalStayCookie(cookieVal: string | undefined): { urlToken: string } | null {
  if (!cookieVal) return null;
  const secret = hmacSecret();
  if (!secret) return null;
  const i = cookieVal.lastIndexOf(".");
  if (i < 0) return null;
  const body = cookieVal.slice(0, i);
  const sig = cookieVal.slice(i + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  try {
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { t?: string; exp?: number };
    if (typeof p.t !== "string" || typeof p.exp !== "number") return null;
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return { urlToken: p.t };
  } catch {
    return null;
  }
}

export { COOKIE_NAME, COOKIE_MAX_AGE_SEC };

export async function verifyJejuExternalPin(pin: string, pinHash: string | null): Promise<boolean> {
  if (!pinHash || !/^\d{4}$/.test(pin)) return false;
  return bcrypt.compare(pin, pinHash);
}

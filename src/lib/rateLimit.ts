import { RateLimiterMemory } from "rate-limiter-flexible";

/**
 * 인메모리 rate limiter (단일 인스턴스 기준).
 * Railway 등 single-instance에서 로그인·비밀번호 찾기 등 민감 API 보호용.
 * 멀티 인스턴스 시 Redis 기반으로 교체 필요.
 */
const limiter = new RateLimiterMemory({
  points: 10,
  duration: 60, // 1분에 10회
});

const limiterStrict = new RateLimiterMemory({
  points: 5,
  duration: 300, // 5분에 5회
});

export async function checkRateLimit(
  key: string,
  strict = false
): Promise<{ ok: boolean; retryAfter?: number }> {
  const rl = strict ? limiterStrict : limiter;
  try {
    await rl.consume(key);
    return { ok: true };
  } catch (e: any) {
    const retryAfter = Math.ceil((e?.msBeforeNext ?? 60000) / 1000);
    return { ok: false, retryAfter };
  }
}

/** IP 또는 식별자로 rate limit 키 생성 */
export function getRateLimitKey(req: Request, suffix = ""): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `rate:${ip}${suffix ? `:${suffix}` : ""}`;
}

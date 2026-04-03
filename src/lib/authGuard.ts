import { NextResponse } from "next/server";
import type { Role } from "@/types";

/**
 * 세션 유저의 역할이 허용 목록에 있는지 검사.
 * - 권한 없으면 403 Response 반환 → 호출부에서 `if (guard) return guard;`
 * - 권한 있으면 null 반환 (계속 진행)
 *
 * @example
 *   const guard = requireRole(user, ["PM", "ADMIN"]);
 *   if (guard) return guard;
 */
export function requireRole(
  user: { role?: string } | null | undefined,
  roles: Role[],
): NextResponse | null {
  if (!user?.role || !(roles as string[]).includes(user.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }
  return null;
}

/**
 * ADMIN 전용 가드 (단축형)
 * @example
 *   const guard = requireAdmin(user);
 *   if (guard) return guard;
 */
export function requireAdmin(
  user: { role?: string } | null | undefined,
): NextResponse | null {
  return requireRole(user, ["ADMIN"]);
}

/**
 * PM 이상(PM·ADMIN) 가드 (단축형)
 */
export function requirePMOrAdmin(
  user: { role?: string } | null | undefined,
): NextResponse | null {
  return requireRole(user, ["PM", "ADMIN"]);
}

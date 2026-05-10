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

/**
 * 설정 접근 가드: PM·ADMIN 또는 isSettingsAdmin=true인 직원.
 * 결재선·역할에는 영향 없이 설정 메뉴(휴가설정·양식관리 등)만 허용.
 */
export function requireSettingsAccess(
  user: { role?: string; isSettingsAdmin?: boolean } | null | undefined,
): NextResponse | null {
  if (!user) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  if (["PM", "ADMIN"].includes(user.role ?? "") || user.isSettingsAdmin) return null;
  return NextResponse.json({ error: "권한 없음" }, { status: 403 });
}

/** 설정 접근 가능 여부 판단 (페이지 redirect용) */
export function canAccessSettings(
  user: { role?: string; isSettingsAdmin?: boolean } | null | undefined,
): boolean {
  if (!user) return false;
  return ["PM", "ADMIN"].includes(user.role ?? "") || !!user.isSettingsAdmin;
}

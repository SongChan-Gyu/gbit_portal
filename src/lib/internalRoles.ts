/** 내부 포털 공통: 역할 판별 (DB 불필요) */
export function isPmOrAdmin(role: string) {
  return role === "PM" || role === "ADMIN";
}

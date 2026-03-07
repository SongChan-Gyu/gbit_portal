/**
 * Prisma가 반환하는 Date 객체를 클라이언트 컴포넌트에 안전하게 전달하기 위해
 * 재귀적으로 Date → ISO string 변환합니다.
 */
export function serializeDates<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString() as unknown as T;
  if (Array.isArray(obj)) return obj.map(serializeDates) as unknown as T;
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = serializeDates(v);
    }
    return result as T;
  }
  return obj;
}

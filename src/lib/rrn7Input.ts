/** 주민번호 앞 6자리 + 성별 1자리 → XXXXXX-X */
export function formatRrn7(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 7);
  if (digits.length <= 6) return digits;
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export function isValidRrn7(value: string): boolean {
  return /^\d{6}-\d$/.test(value.trim());
}

export function rrn7Placeholder() {
  return "000000-0";
}

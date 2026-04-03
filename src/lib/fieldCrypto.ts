/**
 * 개인정보(핸드폰번호·이메일) DB 필드 암호화 유틸리티
 * 알고리즘: AES-256-GCM (무결성 보장, NIST 권고)
 *
 * 환경변수 FIELD_ENCRYPT_KEY: 64자리 hex 문자열 (32바이트 키)
 *   생성 예시: openssl rand -hex 32
 *
 * 저장 형식: "ENC:v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>"
 *   - FIELD_ENCRYPT_KEY 미설정 시 평문 그대로 저장 (개발 환경 호환)
 *   - "ENC:v1:" 접두사가 없는 값은 미암호화 평문으로 간주해 그대로 반환 (마이그레이션 과도기 대응)
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm" as const;
const MARKER = "ENC:v1:";

function getKey(): Buffer | null {
  const hex = process.env.FIELD_ENCRYPT_KEY?.trim();
  if (!hex || hex.length < 64) return null;
  return Buffer.from(hex.slice(0, 64), "hex");
}

/** 값 암호화. FIELD_ENCRYPT_KEY 미설정 시 평문 반환. */
export function encryptField(value: string): string {
  if (!value) return value;
  if (value.startsWith(MARKER)) return value; // 이미 암호화됨
  const key = getKey();
  if (!key) return value; // 키 없으면 평문 유지 (dev 환경)

  const iv = crypto.randomBytes(12); // GCM 표준 96-bit IV
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${MARKER}${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/** 값 복호화. 암호화되지 않은 평문이면 그대로 반환 (마이그레이션 과도기 대응). */
export function decryptField(value: string): string {
  if (!value || !value.startsWith(MARKER)) return value; // 평문 또는 빈 값
  const key = getKey();
  if (!key) return value; // 키 없으면 그대로 반환

  try {
    const inner = value.slice(MARKER.length);
    const colonIdx1 = inner.indexOf(":");
    const colonIdx2 = inner.indexOf(":", colonIdx1 + 1);
    if (colonIdx1 < 0 || colonIdx2 < 0) return value;

    const iv = Buffer.from(inner.slice(0, colonIdx1), "hex");
    const authTag = Buffer.from(inner.slice(colonIdx1 + 1, colonIdx2), "hex");
    const ciphertext = Buffer.from(inner.slice(colonIdx2 + 1), "hex");

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // 복호화 실패 시 원본 반환 (키 불일치 등)
    return value;
  }
}

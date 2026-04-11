/**
 * Employee.emailEnabled — DB 컬럼은 유지하되, 값은 **이메일 주소 유무와 항상 동기**한다.
 * 시스템 메일(초대·비번 찾기·아이디 찾기 등)은 주소만 보고 발송하며 이 플래그로 막지 않는다.
 */
export function emailEnabledSyncedToAddress(email: string | null | undefined): boolean {
  return !!(email && String(email).trim());
}

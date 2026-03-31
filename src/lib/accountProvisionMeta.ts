export const ACCOUNT_PROVISION_REASON = {
  ALREADY_HAS_ACCOUNT: "이미 계정이 있는 사원입니다.",
  PHONE_INVALID: "휴대폰번호 미등록/형식오류",
  BIRTHDATE_MISSING: "생년월일 미등록",
  EMAIL_DISABLED: "이메일 전송(수신) 미사용",
  EMAIL_MISSING: "이메일 미등록",
} as const;

type ProvisionResultKind = "SKIPPED" | "FAILED";

export function classifyProvisionReason(reason: string): ProvisionResultKind {
  if (
    reason === ACCOUNT_PROVISION_REASON.ALREADY_HAS_ACCOUNT ||
    reason === ACCOUNT_PROVISION_REASON.PHONE_INVALID ||
    reason === ACCOUNT_PROVISION_REASON.BIRTHDATE_MISSING ||
    reason === ACCOUNT_PROVISION_REASON.EMAIL_DISABLED ||
    reason === ACCOUNT_PROVISION_REASON.EMAIL_MISSING
  ) {
    return "SKIPPED";
  }
  return "FAILED";
}

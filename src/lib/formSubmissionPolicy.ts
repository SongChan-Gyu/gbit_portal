import { HEALTH_CHECK_FORM_SLUG } from "@/lib/healthCheck";

/** 기존 제출을 덮어쓰지 않고 다건 저장하는 양식 여부 */
export function allowsMultipleSubmissions(form: { slug?: string | null }): boolean {
  // 건강검진은 직원 유형별 정책이 달라 제출 API/화면에서 별도로 판단한다.
  if (form.slug === HEALTH_CHECK_FORM_SLUG) return false;
  return false;
}
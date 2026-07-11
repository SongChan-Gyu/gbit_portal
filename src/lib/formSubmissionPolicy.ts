import { HEALTH_CHECK_FORM_SLUG } from "@/lib/healthCheck";

/** 본인·가족 등 여러 명을 각각 제출하는 양식 (제출 시 기존 건을 덮어쓰지 않음) */
export function allowsMultipleSubmissions(form: { slug?: string | null }): boolean {
  return form.slug === HEALTH_CHECK_FORM_SLUG;
}
/** 휴가 유형 코드 → 신청 화면 그룹 키 */
export const APPLY_GROUP_BY_CODE: Record<string, string> = {
  ANNUAL: "annual",
  AM_HALF: "annual",
  PM_HALF: "annual",
  CONDOLENCE: "condolence",
  CARE: "care",
  CARE_AM: "care",
  CARE_PM: "care",
  PUBLIC: "public",
  PUBLIC_AM: "public",
  PUBLIC_PM: "public",
  RECOGNITION: "recognition",
  RECOGNITION_AM: "recognition",
  RECOGNITION_PM: "recognition",
  PM_HALF_MONTH: "halfday",
  SICK: "sick",
  HEALING_DAY: "stamp",
  PM_RECOG_STAMP: "stamp",
  TENURE_1Y: "tenure",
  TENURE_5Y: "tenure",
  TENURE_10Y: "tenure",
  AWARD: "award",
  HOLIDAY_EXT: "holidayExt",
  HOLIDAY_EXT_AM: "holidayExt",
  HOLIDAY_EXT_PM: "holidayExt",
  BIRTHDAY_HALF_AM: "birthday",
  BIRTHDAY_HALF: "birthday",
};

export const APPLY_GROUP_ORDER = [
  "annual",
  "condolence",
  "care",
  "public",
  "recognition",
  "halfday",
  "sick",
  "stamp",
  "award",
  "holidayExt",
  "birthday",
  "tenure",
  "_etc",
] as const;

export type ApplyGroupKey = (typeof APPLY_GROUP_ORDER)[number];

export const APPLY_GROUP_META: Record<
  string,
  { label: string; meta: string; color: string; borderClass: string }
> = {
  annual: { label: "연차", meta: "연차 차감", color: "#2563eb", borderClass: "border-blue-500" },
  condolence: { label: "경조", meta: "", color: "#f59e0b", borderClass: "border-amber-500" },
  care: { label: "돌봄휴가", meta: "연 2일 한도", color: "#059669", borderClass: "border-emerald-500" },
  public: { label: "공가", meta: "", color: "#64748b", borderClass: "border-slate-600" },
  recognition: { label: "인정휴가", meta: "", color: "#475569", borderClass: "border-slate-500" },
  halfday: { label: "하프데이", meta: "수요일 오후", color: "#0284c7", borderClass: "border-sky-500" },
  sick: { label: "병가", meta: "미차감 (급여만 감액)", color: "#dc2626", borderClass: "border-red-500" },
  stamp: { label: "스탬프", meta: "힐링데이·오후인정", color: "#d97706", borderClass: "border-amber-500" },
  award: { label: "포상휴가", meta: "별도 부여", color: "#7c3aed", borderClass: "border-violet-500" },
  holidayExt: { label: "연휴연장휴가", meta: "전용 부여 1일", color: "#0ea5e9", borderClass: "border-sky-500" },
  birthday: { label: "생일반차", meta: "해당 월 부여", color: "#ec4899", borderClass: "border-pink-500" },
  tenure: { label: "근속휴가", meta: "입사 기념일 부여", color: "#10b981", borderClass: "border-emerald-600" },
  _etc: { label: "기타", meta: "기타 유형", color: "#6b7280", borderClass: "border-gray-400" },
};

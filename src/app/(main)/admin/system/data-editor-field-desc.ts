/** DB 데이터 편집 탭에서 사용하는 테이블/필드별 설명 */
export const DATA_EDITOR_FIELD_DESCRIPTIONS: Record<string, Record<string, string>> = {
  SystemConfig: {
    key: "설정 키 (고유). 예: menuPermissions, jejuDepositAccount",
    value: "JSON 문자열. 메뉴 권한, 제주 계좌 정보 등 저장",
    updatedAt: "마지막 수정 시각",
  },
  Team: {
    id: "팀 고유 ID (변경 불가)",
    name: "팀 표시명",
    sortOrder: "목록 정렬 순서 (작을수록 앞)",
    leaderId: "팀장으로 지정할 사원 ID (선택)",
    leaderName: "팀장 이름 (조회용)",
    createdAt: "생성 시각",
    updatedAt: "마지막 수정 시각",
  },
  AllocationSourceConfig: {
    id: "고유 ID (변경 불가)",
    sourceCode: "귀속연도 부여 구분 코드 (예: BASE_ANNUAL, CARE)",
    label: "화면 표시명",
    sortOrder: "정렬 순서",
    isActive: "사용 여부",
    defaultDays: "고정 부여일 수 (null이면 계산 로직 사용)",
    note: "비고",
    updatedAt: "마지막 수정 시각",
  },
  SchedulerJobType: {
    id: "고유 ID (변경 불가)",
    jobKey: "작업 키 (예: monthly_accrual, birthday_half)",
    name: "표시명",
    description: "설명",
    sortOrder: "정렬 순서",
    isActive: "사용 여부",
    updatedAt: "마지막 수정 시각",
  },
};

/** SystemConfig 키별 설명 (키 값에 대한 설명) */
export const SYSTEM_CONFIG_KEY_DESCRIPTIONS: Record<string, string> = {
  menuPermissions: "역할별 메뉴 접근 권한 JSON. { STAFF: [메뉴ID...], PM: [...], ADMIN: [...] }",
  jejuDepositAccount: "제주 숙소 예약금 입금 계좌 정보 JSON. { bankName, accountNumber, holderName }",
  jejuBlockedDates: "제주 숙소 예약 불가일 JSON. [\"YYYY-MM-DD\", ...]",
};

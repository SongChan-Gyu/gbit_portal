# 휴가·스케줄러 전체 설계 문서

이 문서는 현재 구현된 **휴가/근태/스케줄러 전체 규칙과 DB 코드값**을 한 번에 볼 수 있도록 정리한 스펙 문서입니다.  
개발/운영/기획 모두 이 문서를 기준으로 기능과 데이터를 이해할 수 있습니다.

> 참고: **상세 플로우(상태별 취소/결재 흐름)** 은 `docs/LEAVE-FLOW.md` 에 정리되어 있습니다.

---

## 1. 역할·권한 체계

### 1.1 직원 역할 (`Employee.role`)

| 값 | 의미 | 주요 권한 |
|----|------|-----------|
| `STAFF` | 일반 직원 | 휴가 신청·조회, 스탬프 요청, 제주시설 신청 |
| `TEAM_LEAD` | 팀장 | 팀원 휴가 결재(1단계), 본인 휴가 중 1단계로 끝나는 유형은 자동 승인 |
| `PM` | PM | 전사 휴가 2단계 승인, 관리자 메뉴 일부, 자동 부여/스케줄러 실행 |
| `ADMIN` | 관리자 | 모든 관리자 메뉴, 모든 직원 휴가 내역 조회·직권 취소, 시스템 설정 |

### 1.2 직급부서 (`Employee.dutyDept`)

직급부서는 귀속연도 초기화 시 부여되는 **직무부서 휴가(예: 2일)** 계산에 사용됩니다.

| 값 | 의미 |
|----|------|
| `OPERATIONS` | 운영부 |
| `EDUCATION` | 교육부 |
| `WELFARE` | 복지부 |
| `NONE` 또는 `null` | 해당사항 없음 |

---

## 2. 주요 DB 및 코드값

### 2.1 휴가 유형 (`LeaveType.code`)

> ※ 아래는 핵심 코드만 정리. 실제 필드는 `deductFromBalance`, `approvalSteps`, `maxPerMonth`, `requiresStamp`, `isHalf` 등으로 구성됩니다.

| 코드 | 이름 | 차감 | 승인 단계 | 비고 |
|------|------|------|----------|------|
| `ANNUAL` | 연차 | 연차 차감 | 2 | 기본 연차 1일 단위 |
| `AM_HALF` | 연차(오전반차) | 연차 0.5일 차감 | 2 | 오전 반차 |
| `PM_HALF` | 연차(오후반차) | 연차 0.5일 차감 | 2 | 오후 반차 |
| `PM_HALF_MONTH` | 하프데이 | **미차감** | 1 | 월 1회, 팀장 1단계, 오후 인정 |
| `CARE` / `CARE_AM` / `CARE_PM` | 돌봄휴가 (1일/0.5일) | **미차감** | 2 | 연 2일 한도, CARE 전용 풀에서 차감 |
| `SICK` | 병가 | **미차감** | 2 | 급여만 감액, 연차 차감 X |
| `HOLIDAY_EXT` | 연휴연장휴가 | **미차감** | 2 | 귀속연도 1일, **1일 단위만 사용** |
| `BIRTHDAY_HALF` | 생일반차 | **미차감** | 1 | 해당 월 0.5일, 생일 월에 스케줄러로 부여 |
| `TENURE_1Y/5Y/10Y` | 근속휴가 | 미차감 | 1 | 근속 기념일 기준 1년 이내 사용 |
| `CONDOLENCE` 계열 | 경조/조의 휴가 | 미차감 | 2 | 경조항목별 일수는 화면 규정 참고 |
| `HEALING_DAY` | 힐링데이 | 0일, 미차감 | 0 | 스탬프 5개 사용, 이력만 기록 |
| `PM_RECOG_STAMP` | 오후인정(스탬프) | 미차감 | 1 | 스탬프 10개 사용 |
| `AWARD` | 포상휴가 | 미차감 | 1 | 포상·성과용 |

### 2.2 휴가 신청/결재 상태

#### 2.2.1 `LeaveRequest.status`

| 값 | 의미 |
|----|------|
| `PENDING` | 결재 대기 (최종 승인 전) |
| `APPROVED` | 최종 승인 완료 |
| `REJECTED` | 반려 |
| `CANCELLED` | 취소 완료 (신청 철회 또는 취소 승인 후) |
| `CANCEL_REQUESTED` | 승인된 휴가에 대한 취소 신청 접수 (취소 결재 대기) |

#### 2.2.2 `LeaveApproval.status`

| 값 | 의미 |
|----|------|
| `PENDING` | 결재 대기 |
| `APPROVED` | 승인 |
| `REJECTED` | 반려 |
| `CANCEL_PENDING` | 취소 결재 대기 |
| `CANCEL_APPROVED` | 취소 승인 |
| `CANCEL_REJECTED` | 취소 반려 |

### 2.3 연차/할당 관련 (`LeaveAllocation.sourceCode`)

| sourceCode | 의미 | 비고 |
|-----------|------|------|
| `BASE_ANNUAL` | 기본 연차 | 1년 이상 15일, 1년 미만은 월별 적립 |
| `TENURE_BONUS` | 근속 가산 | 2년마다 +1일 (최대 +10) |
| `TENURE_1Y/5Y/10Y` | 근속휴가 | 기념일에 별도 부여 (일수 3/5/10) |
| `CARRYOVER` | 이월연차 | 이전 귀속연도 잔여 |
| `DEPT_BONUS` | 부서 추가 | 부서별 추가 휴가 시 사용 |
| `CARE` | 돌봄휴가 전용 풀 | 연 2일, CARE 계열 타입이 여기서만 차감 |
| `HOLIDAY_EXT` | 연휴연장 전용 풀 | 귀속연도 1일 전용 |
| `BIRTHDAY_HALF` | 생일반차 전용 풀 | 해당 월 0.5일, 연월 단위(fiscalYear=YYYYMM) |
| `DUTY_DEPT` | 직무부서 휴가 | 운영/교육/복지부 2일 등 |
| `MONTHLY_ACCRUAL_YYYY_MM` | 월별 적립 연차 | 입사 1년 미만 월 1일씩 적립 |

### 2.4 자동 부여 구분값 (`AllocationSourceConfig`)

시드 기준:

| sourceCode | label | defaultDays | 설명 |
|-----------|-------|-------------|------|
| `BASE_ANNUAL` | 기본연차 | null | 1년 이상 15일, 1년 미만은 월별 계산 |
| `TENURE_BONUS` | 근속가산 | null | 2년마다 +1일, 최대 +10 |
| `CARE` | 돌봄휴가 | 2 | 전 직원 2일 부여 |
| `HOLIDAY_EXT` | 연휴연장휴가 | 1 | 전 직원 1일, 1일 단위 사용 |
| `DUTY_DEPT` | 직무부서휴가 | 2 | 운영/교육/복지부 2일 |

### 2.5 스케줄러 메타데이터 (`SchedulerJobType`)

시드 기준:

| jobKey | name | description |
|--------|------|-------------|
| `monthly_accrual` | 월별 연차 적립 | 입사 1년 미만 직원에게 월 1일 연차 자동 적립 |
| `tenure_check` | 근속 기념일 휴가 | 1·5·10년 근속 기념일 도래 시 근속휴가 자동 부여 |
| `birthday_half` | 생일반차쿠폰 | 직원 생일이 속한 월에 0.5일 생일반차 자동 부여 |

향후에는 각 스케줄러 jobKey에 대해 `isActive` 및 연결된 `sourceCode`/`LeaveType.code`를 UI에서 설정/표시하는 구조로 확장할 수 있습니다.

---

## 3. 휴가 규정 요약 (화면·요건 기준)

### 3.1 연차 규정

- 귀속기간: **매년 5월 1일 ~ 다음해 4월 30일**
- 기본 연차: 입사 1년 이상 15일 (정규/프리랜서 동일)
- 1년 미만: 매월 만근 시 1일 발생 (최대 11일) → `monthly_accrual` 스케줄러 및 시드에서 처리
- 근속 가산: 2년마다 +1일, 최대 +10일 (`TENURE_BONUS`)
- 근속휴가: 1/5/10년 근속 시 3/5/10일, 기념일 기준 1년 유효 (`TENURE_1Y/5Y/10Y`)

### 3.2 특별 휴가

- **돌봄휴가 (CARE)**: 연 2일, 미차감, 별도 풀(`CARE`)에서 차감
- **병가 (SICK)**: 연차 차감 없음, 급여만 감액(규정 내용은 화면 참고)
- **연휴연장휴가 (HOLIDAY_EXT)**: 귀속연도당 1일, 1일 단위만 허용, 미차감
- **생일반차 (BIRTHDAY_HALF)**: 생일이 속한 월에 0.5일, `birthday_half` 스케줄러로 부여
- **하프데이 (PM_HALF_MONTH)**: 월 1회, 오후 인정, 미차감, 팀장 1단계 승인
- **스탬프/힐링데이**:
  - 출근 스탬프 5개 → 힐링데이(16시 조기퇴근, 이력만 기록, 미차감)
  - 출근 스탬프 10개 → 오후인정(스탬프) 0.5일, 미차감

### 3.3 휴일·중복 검증

- 휴가 신청 시:
  - 요청 기간에 **주말·공휴일·대체공휴일** 포함 시 신청 불가  
    → Nager.Date + 자체 정의 `SUPPLEMENT_HOLIDAYS_KR` 활용
  - 동일 직원, 동일 기간에 **PENDING/APPROVED** 신청이 이미 있으면 중복 신청 불가

---

## 4. 결재·취소 요건 (역할별)

자세한 상태 전이는 `docs/LEAVE-FLOW.md` 참조.

### 4.1 승인 단계 계산

- 각 항목의 `LeaveType.approvalSteps` 중 최댓값 = `LeaveRequest.totalSteps`
- 역할별:
  - **PM/ADMIN가 신청**: 모든 유형 **자동 승인** (auto-approve, `totalSteps=0`)
  - **TEAM_LEAD가 신청**:
    - 신청한 유형들의 `approvalSteps` 최대값이 1이면 → **본인 신청 즉시 승인 (팀장에서 끝)**  
    - 최대값이 2이면 → 팀장 1단계, PM 2단계로 진행
  - **STAFF가 신청**:
    - 팀장 1단계 (`TEAM_LEAD`), 필요 시 PM 2단계

### 4.2 취소 가능 조건

- **PENDING (최종 승인 전)**:
  - 본인만 `POST /api/leave/request/[id]/cancel` 로 **즉시 취소** 가능
  - 상태: `PENDING` → `CANCELLED`, 스탬프 복원 (할당 차감은 아직 없음)
- **APPROVED (최종 승인 후)**:
  - 본인: `POST /api/leave/request/[id]/cancel-request` 로 **취소 신청**만 가능 (`status: CANCEL_REQUESTED`)
  - 결재자(TEAM_LEAD/PM)가 `POST /api/leave/cancel-approve` 로 취소 승인 시:
    - `status: CANCELLED`
    - 할당(`LeaveAllocation.usedDays`) 차감분 복원
    - 스탬프 복원
- **관리자 직권 취소 (ADMIN)**:
  - `POST /api/leave/request/[id]/admin-cancel`
  - `PENDING` 또는 `APPROVED` 인 모든 직원의 신청에 대해 직권 취소 가능
  - APPROVED인 경우에도 동일하게 할당/스탬프 복원 후 `CANCELLED`

---

## 5. 스케줄러 동작 및 메타데이터

### 5.1 스케줄러 작업 (비즈니스 로직)

`src/lib/scheduler.ts`:

1. **월별 연차 적립 (`monthly_accrual`)**
   - 함수: `runMonthlyAccrual(targetMonth?, dryRun?, actorId?)`
   - 대상: 입사 1년 미만 직원
   - 내용: 해당 월에 1일 연차 적립 (`sourceCode=MONTHLY_ACCRUAL_YYYY_MM`, label=월별적립)
   - 유효기간: 귀속연도 종료(다음 해 4/30)까지

2. **근속 기념일 휴가 (`tenure_check`)**
   - 함수: `runTenureCheck(targetDate?, window?, dryRun?, actorId?)`
   - 대상: 1·5·10년 근속 도래자 (±window일 범위)
   - 내용: `TENURE_1Y/5Y/10Y` 할당 생성, 유효기간 12개월

3. **생일반차 (`birthday_half`)**
   - 함수: `runBirthdayHalf(yearMonth?, dryRun?, actorId?)`
   - 대상: 해당 `yearMonth`에 생일이 있는 직원
   - 내용: `BIRTHDAY_HALF` 할당 0.5일 생성 (해당 월 1~말일까지 유효)

각 실행 결과는 `SchedulerLog`에 기록되며, `SchedulerPanel` 에서 조회 가능합니다.

### 5.2 스케줄러 API

- `/api/cron/monthly-accrual` → `monthly_accrual` 실행/미리보기
- `/api/cron/tenure-check` → `tenure_check` 실행/미리보기
- `/api/cron/birthday-half` → `birthday_half` 실행

인증:
- 서버 측 `cron-runner.mjs` 에서 `x-cron-secret` 헤더를 보내면 **자동 스케줄러 모드**로 실행
- 관리자가 화면에서 수동 실행 시 → `auth()` 후 `role in (ADMIN, PM)` 인지 체크

### 5.3 스케줄러 메타데이터 활용 방향

현재:

- `SchedulerJobType` 으로 각 스케줄러 작업의 **존재/정렬/활성 여부**를 관리
- `AllocationSourceConfig` 로 어떤 소스 코드가 자동 부여 대상인지 정의

확장 방향(요구사항 반영):

- 휴가 설정 화면(`admin/leave-settings`) 또는 스케줄러 화면(`admin/scheduler`)에서:
  - `SchedulerJobType` 목록을 읽어와 **작업별 ON/OFF 토글** 제공 (`isActive`)
  - 각 jobKey마다 어떤 `sourceCode` / `LeaveType.code` 를 사용하는지 **텍스트 또는 설정값으로 명시**
  - 스케줄러 패널의 상단 탭은 1개로 두고, 내부에서 `SchedulerJobType` 메타데이터를 기준으로 어떤 UI 블록(월별/근속/생일반차)을 보여줄지 결정

이렇게 하면 스케줄러 또한 **전부 메타데이터(`SchedulerJobType` + `AllocationSourceConfig`) 기반으로 관리**할 수 있게 됩니다.

---

## 6. 초기 데이터 및 테스트

### 6.1 시드 데이터

- 파일: `prisma/seed.ts`
- 주요 내용:
  - 팀/직원 계정 생성 (pm, team1, staff1, ... admin 계정 포함)
  - `LeaveType` 전체 upsert (위 표의 코드들)
  - `AllocationSourceConfig`, `SchedulerJobType` 시드
  - 2025 귀속연도 기준 각 직원별 할당 생성 (기본연차, 근속가산, CARE, HOLIDAY_EXT 등)
  - 샘플 휴가 신청/승인/사용 이력 생성 (여러 직원에 대해 다양한 케이스)
  - `syncHolidaysToDb` 로 공휴일/대체공휴일 동기화

실행:

```bash
npx tsx prisma/seed.ts
```

### 6.2 정합성 검증 스크립트

- 파일: `scripts/verify-leave-policy.ts`
- 실행:

```bash
npm run verify:leave   # package.json에 등록
```

- 검증 항목:
  - 귀속연도 계산 (5/1 ~ 익년 4/30)
  - 휴가 유형별 규정 매칭 (차감 여부, 승인 단계, 하프데이 월 1회 등)
  - `LeaveAllocation.usedDays` 와 승인된 신청 합계 일수 일치 (APPROVED + CANCEL_REQUESTED)
  - 승인된 휴가의 결재 단계 수 vs `totalSteps` 일치
  - `(employeeId, sourceCode, fiscalYear)` 조합당 할당 1개 (근속 마일스톤 포함)
  - 2025 귀속 CARE/HOLIDAY_EXT 할당 존재 여부

---

이 문서와 `docs/LEAVE-FLOW.md` 를 함께 보면, **요구사항 → 화면 → API → DB 코드값 → 스케줄러** 까지 한 번에 추적할 수 있습니다.


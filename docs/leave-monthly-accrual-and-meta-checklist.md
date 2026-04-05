# 휴가: 월별 적립·메타(소스 코드) 관리 — 대화 정리 & 체크리스트

이 문서는 대화에서 나온 요구를 **한곳에 고정**해 두는 용도입니다. 이후 같은 주제로 물을 때 **아직 안 된 항목만** 골라 작업하면 됩니다.

---

## 1. 월별 적립(입사 1년 미만 등) — 도메인 정리

- **표시(휴가 현황)**: `BASE_ANNUAL`이면서 노트에 `MONTHLY_ACCRUAL:`가 있거나, `sourceCode`가 `MONTHLY_ACCRUAL_*`인 행은 **한 열로 묶어** 합산한다. (`src/lib/leaveOverviewTable.ts`, `OVERVIEW_MONTHLY_BUNDLE_KEY`)
- **유효기간(의도)**: N월에 부여되면 **N월 1일 ~ 해당 귀속연도 말(4/30)**까지 쓸 수 있는 구조. (코드는 `src/lib/scheduler.ts` 등에서 확인·유지)
- **귀속연도 일괄 초기화(`fiscal-year/init`)**: 입사 1년 미만 월별 적립은 **스케줄러와 동일 규칙**으로 `syncMonthlyAccrualPoolForFiscalInit`가 한 번에 맞춘다. `asOf`는 `asOfKstTodayForMonthlyAccrual()`(= KST 오늘, `todayStr`)로 스케줄러 당월과 동일 기준 → 적립 상한은 **당월 말**까지(`monthlyAccrualCapDate`).
- **월별 적립 스케줄러(`runMonthlyAccrual`)**: 인자 없으면 **KST 당월** 1일분을 적립(예: 3월 실행 → `2026-03`). 관리자 UI 월 선택 기본값도 동일.
- **"이월"**: 연 단일 이월 객체가 아니라, **월별로 쌓이는 할당 + 각자 유효기간**에 가깝다. 현황 표에서는 위 묶음 열로 합쳐 보여 준다.

---

## 2. 메타(코드값) 관리 — 무엇을 말하는지

- **AllocationSourceConfig** (`sourceCode`, `label`, `sortOrder`, …): 귀속 초기화·관리자 휴가 현황 **열 순서·라벨**의 기준. 스케줄러만 부여하는 소스(예: `BIRTHDAY_HALF`)도 **여기에 있어야** 코드 대신 한글 라벨이 나온다.
- **시드/운영**: `prisma/seed.ts`, `prisma/seed-base.ts`에 소스 메타를 넣고, 이미 돌아가는 DB는 시드 재실행 또는 관리 화면으로 맞춤.

---

## 3. 이미 반영된 구현 (모든 항목 완료)

- [x] 휴가 현황: 소스별 열 **메타 전부 고정** + 메타 `sortOrder`, `BASE_ANNUAL` 다음 월별 적립 열 항상 표시
- [x] 귀속 초기화 dryRun: `previewMatrix` (행=사원, 열=부여 소스), `FiscalYearManager` UI
- [x] 일수 표시: 정수는 `3`, 소수만 `0.5` 형태; 소스 셀 없음 → `0` 스타일 표현
- [x] `BIRTHDAY_HALF`: AllocationSourceConfig 시드 + 폴백 라벨 (`leaveOverviewTable`)
- [x] 메뉴: 월별 근태·스탬프를 휴가 하위로 이동 등 (별도 UX)
- [x] `db.ts`: `$allModels.$allOperations`로 중첩 include된 employee도 phone/email 자동 복호화
- [x] `authGuard.ts`: `requireRole` / `requireAdmin` / `requirePMOrAdmin` 공통 헬퍼, API route 전체 적용
- [x] `DUTY_DEPT_CODES` / `DUTY_DEPT_TO_LABEL` 상수를 `employeeExcel.ts`로 이전(하드코딩 제거)
- [x] `MobileNav.tsx` 삭제 (Header가 Sidebar overlay로 대체, 미사용 데드코드)
- [x] TypeScript 에러 0: `DB`, `DBTx` 타입 export → lib 파일 파라미터 타입 교체
- [x] **날짜 UTC/KST 혼용 통일**: `leaveCalc.ts` `fiscalPeriod`, `monthlyAccrualPool.ts`, `leave/my/page.tsx`, `attendance/page.tsx`, `AllocationsClient.tsx` 등 전체를 `new Date(y, m-1, d)` (KST 로컬 생성자) 또는 `+09:00` 명시 오프셋으로 통일. `workdays.ts`에 `kstMidnight`, `kstEndOfDay` 헬퍼 추가.
- [x] **중첩 include 복호화 경로 검증**: jeju routes의 `employee.phone`이 `$allModels.$allOperations` 재귀 탐색으로 자동 복호화됨 확인
- [x] **`stamp/approve` TEAM_LEAD 권한 복원**: 배치 스크립트로 `requirePMOrAdmin`으로 잘못 교체된 것을 `requireRole(actor, ["TEAM_LEAD","PM","ADMIN"])`으로 수정

---

## 4. 수동 테스트 메모 (바꾼 조회·기능 — 까먹지 말 것)

**갱신일: 2026-04-03** — 배포·머지 후 아래만 훑어보면 됨.

### 관리 → 휴가 부여·현황

- [ ] **휴가 현황** 탭: 설명 **아래**에 년도 pill(전년/당해/익년) 오는지
- [ ] 표 **소스별 열이 메타 전부** 나오는지(할당 없어도 열·`0/0`), 순서·라벨이 `AllocationSourceConfig`와 같은지, **기본연차** 다음 **월별적립** 열이 항상 있는지
- [ ] 소스 셀 값이 **`부여/사용`**만 보이는지 (예: `8/0`, 예전처럼 `8 (8/0)` 아님)
- [ ] **정수는 소수점 없음**(`3`), **0.5만 소수**; 할당 없는 소스는 **`0/0`** 느낌으로 보이는지
- [ ] **합계 열**(자산 부여·사용·잔여)·**사유형 사용**도 같은 일수 포맷 규칙인지
- [ ] **팀** 없으면 `-`, 휴가 숫자는 0으로 나오는지
- [ ] 셀 **호버 툴팁**에 부여/사용/잔여 문구 남아 있는지
- [ ] **생일반차** 열 헤더가 한글(생일반차)인지 — 운영 DB에 `BIRTHDAY_HALF` 메타 없으면 시드/DB 반영 필요

### 관리 → 휴가 부여·현황 → 휴가 할당

- [ ] 년도 선택이 안내 문구 **아래**에 있는지
- [ ] **귀속연도 미리보기**: 표가 **행=사원, 열=부여 소스** 피벗인지, 가로 스크롤·일수 표기(정수 `3일` 등) 괜찮은지
- [ ] 미리보기 후 **저장(적용)** 확인 창의 **건수**가 비어 있는 셀 제외하고 맞는지, 실제 저장 후 요약 메시지 정상인지

### 메뉴·화면 문구

- [ ] **휴가** 하위에 **월별 근태 현황**, **스탬프 쿠폰** 들어가고 상단 단독 메뉴는 없어졌는지 (사이드바·모바일)
- [ ] **관리**: `유동 양식 관리`, `공지사항 관리` 라벨
- [ ] **월별 근태 현황** 페이지 제목·모바일 메뉴 이름

### 암호화·권한 확인

- [ ] 관리자 사원 목록에서 전화번호·이메일이 **정상 복호화**되어 보이는지
- [ ] 제주숙소 알림·휴가 결재 알림 등 **중첩 include `employee.phone`** 복호화 정상인지 (로그 확인)
- [ ] 스탬프 쿠폰 승인·반려: **팀장(TEAM_LEAD)도 승인 가능**한지

### 시드·DB

- [ ] 로컬/스테이징에서 `prisma` 시드 또는 `seed-base` 돌린 뒤 **AllocationSourceConfig**에 `BIRTHDAY_HALF` 생기는지 (이미 돌린 DB는 생략 가능)

---

## 5. 관련 코드 위치(빠른 점프)

| 주제 | 파일 |
|------|------|
| 현황 열·월별 묶음·일수 포맷 | `src/lib/leaveOverviewTable.ts` |
| 휴가 현황 페이지 | `src/app/(main)/admin/leave-management/page.tsx` |
| 귀속 초기화 API | `src/app/api/admin/fiscal-year/init/route.ts` |
| 초기화 미리보기 UI | `src/app/(main)/admin/fiscal-year/FiscalYearManager.tsx` |
| 월별 적립 생성 | `src/lib/scheduler.ts` |
| 소스 메타 시드 | `prisma/seed.ts`, `prisma/seed-base.ts` |
| 공통 역할 가드 | `src/lib/authGuard.ts` |
| PII 암호화/복호화 | `src/lib/db.ts`, `src/lib/fieldCrypto.ts` |
| DUTY_DEPT 상수 | `src/lib/employeeExcel.ts` (`DUTY_DEPT_CODES`, `DUTY_DEPT_TO_LABEL`) |
| KST 날짜 헬퍼 | `src/lib/workdays.ts` (`kstMidnight`, `kstEndOfDay`) |

---

*이 섹션은 기능 바꿀 때마다 **날짜 갱신 + 항목 추가/삭제**해 두면 테스트 범위를 안 잃는다.*

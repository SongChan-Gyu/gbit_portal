# 프로젝트 검증 보고서

검증 일시: 2025-03-02  
대상: hrm-web (Next.js 15 + Prisma + SQLite)

---

## 1. 빌드 및 타입

| 항목 | 결과 |
|------|------|
| `npm run build` | ✅ 성공 (68개 라우트 정상 생성) |
| TypeScript 타입 검사 | ✅ 통과 |
| Prisma 스키마 검증 | ✅ `prisma validate` 통과 |

- **경고**: 일부 페이지에서 `metadata.viewport` 사용 시 Next.js 권장 방식(viewport export)으로 이동 권장. 기능에는 영향 없음.

---

## 2. 인증·권한

- **레이아웃**: `(main)/layout.tsx`에서 비로그인 시 `/login` 리다이렉트 ✅
- **역할 체크**: PM/ADMIN 전용 페이지(`/admin/*`, `/test/impersonate` 등)에서 `user.role` 기준 redirect 일관 적용 ✅
- **결재함/스탬프 승인**: TEAM_LEAD, PM, ADMIN만 접근 ✅

---

## 3. 라우팅 구조

- **리다이렉트 정리**: `/admin/teams` → organization, `/admin/leave-types` → leave-settings, `/admin/fiscal-year` → leave-management 등 단일 진입점으로 정리됨 ✅
- **notFound**: 사원 상세(`/admin/employees/[id]`), 초대(`/register/[token]`)에서 미존재 시 `notFound()` 호출 ✅

---

## 4. 휴가·스케줄러

- **휴가 신청 API** (`/api/leave/request`): 연차/돌봄/연휴연장/생일반차 전용 풀 구분 및 차감 로직 반영 ✅
- **휴가 신청 페이지**: `leaveTypes`, `allocations`, `holidays` 로드 후 폼에 전달 ✅
- **스케줄러**: 월별적립(`monthly_accrual`), 근속체크(`tenure_check`), 생일반차(`birthday_half`) API 및 관리 탭 존재 ✅

---

## 5. 스키마·시드

- **Employee**: `birthDate` (생년월일), `dutyDept` (직급부서) 필드 존재 ✅
- **AllocationSourceConfig, SchedulerJobType**: 귀속연도 자동 부여·스케줄러 유형 기준데이터 테이블 존재 ✅
- **LeaveType**: HOLIDAY_EXT, BIRTHDAY_HALF 등 시드에 포함 (시드 실행 시 DB 반영) ✅

---

## 6. 휴가 규정·데이터 정합성 자체 검증

- **스크립트**: `scripts/verify-leave-policy.ts`
- **실행**: `npm run verify:leave` 또는 `npx tsx scripts/verify-leave-policy.ts`
- **검증 항목**:
  - 귀속연도 5/1~익년 4/30
  - 휴가 유형 규정 매칭 (연차 2단계 결재, 병가 미차감, 돌봄 연 2일, 연휴연장 1일, 하프데이 팀장 1단계, 근속 팀장 1단계)
  - 할당 `usedDays`와 승인된 신청 합계 일치 (APPROVED + CANCEL_REQUESTED)
  - 승인된 휴가의 결재 단계 수 일치
  - 사원·sourceCode·귀속연도별 할당 1개
  - 2025 귀속 돌봄/연휴연장 할당 존재

**시드 후 실제 사용 데이터** (시드에 포함):
- 연차·반차·돌봄·연휴연장·생일반차 사용 내역 (승인 완료)
- E008 1건 **결재 대기 중** (2025-12-02, 팀장 결재 대기)
- 결재 2단계: 일반 직원 → 팀장(1단계) → PM(2단계) 생성 로직 반영

---

## 7. 권장 사항

1. **시드 실행**: 휴가 유형·기준데이터·샘플 할당 반영을 위해 `npx prisma db seed` 또는 `npm run db:seed` 실행 권장. (실행 환경에 따라 ts-node 대신 `npx tsx prisma/seed.ts` 사용 가능)
2. **viewport 경고**: 필요 시 각 페이지의 `metadata.viewport`를 `viewport` export로 분리하면 경고 제거 가능.
3. **ESLint**: 프로젝트 루트에 `eslint.config.js` 또는 `.eslintrc`가 없으면 `npm run lint` 시 설정 안내가 뜰 수 있음. Next.js 권장 설정 적용 시 유지보수에 유리.

---

## 8. 요약

- **빌드·타입·Prisma**: 정상.
- **인증·권한·라우팅**: 일관되게 적용됨.
- **휴가/스케줄러/제주 숙소 등**: 구현 및 라우트 존재 확인.
- 시드 실행 여부와 viewport/ESLint 설정만 필요 시 보완하면 됨.

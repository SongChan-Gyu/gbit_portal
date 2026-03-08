# HRM 휴가관리 시스템 개요

기업 실사용을 목적으로 한 **휴가관리 시스템**입니다.  
메뉴 중 **휴가 규정**(`/leave/policy`) 페이지에 정의된 사내 규정을 근거로 구현되어 있습니다.

---

## 기술 스택

- **Next.js 15** (App Router), **React 19**
- **Prisma** (SQLite 기본)
- **NextAuth v5** (자체 인증)
- **Tailwind CSS**

---

## 휴가 규정 요약 (㈜지비아이티 기준)

- **귀속기간**: 매년 5월 1일 ~ 다음해 4월 30일
- **연차**: 기본 15일, 2년마다 +1일(최대 25일), 1년 미만은 월 만근 시 1일 발생(최대 11일)
- **근속휴가**: 1년 3일, 5년 5일, 10년 10일 (입사일 기준 자동 산정, 유효기간 내 미사용 시 소멸)
- **경조/조의휴가**: 본인 결혼 5일, 부모상 9일 등 (사유 발생일 7일 이내 신청)
- **특별 휴가**: 돌봄휴가(연 2일), 하프데이(월 1회), 스탬프 쿠폰, 포상휴가, 대체휴가, 병가 등
- **반차**: 오전/오후 반차, 연차 0.5일 차감

---

## 메뉴 구조

### 사용자(메인)

| 메뉴 키 | 라벨 | 경로 |
|--------|------|------|
| dashboard | 대시보드 | `/dashboard` |
| leave_apply | 휴가 신청 | `/leave/apply` |
| leave_my | 내 휴가 현황 | `/leave/my` |
| leave_approve | 결재함 | `/leave/approve` |
| **leave_policy** | **휴가 규정** | `/leave/policy` |
| attendance | 근태 현황 | `/attendance` |
| stamp | 스탬프 쿠폰 | `/stamp` |

### 관리자

| 메뉴 키 | 라벨 | 경로 |
|--------|------|------|
| admin_organization | 인사 관리 | `/admin/organization` |
| admin_leave_settings | 휴가 설정 | `/admin/leave-settings` |
| admin_leave_mgmt | 연차 관리 | `/admin/leave-management` |
| admin_system | 시스템 설정 | `/admin/system` |

### 역할별 메뉴

- **STAFF**: dashboard, leave_apply, leave_my, leave_policy, attendance, stamp
- **TEAM_LEAD**: + leave_approve (결재함)
- **PM**: + admin_organization, admin_leave_settings, admin_leave_mgmt, admin_system, 테스트 메뉴
- **ADMIN**: 전체 메뉴

---

## 주요 기능

- **휴가 신청**: 연차/근속/경조/특별 등 유형별 신청, 반차, 다중 일자
- **결재**: 팀장 1단계 또는 팀장+PM 2단계 (휴가 유형별 설정)
- **휴가 취소/취소 신청**: 승인 전 취소, 승인 후 취소 신청 → 결재
- **연차 관리**: 귀속연도별 할당(LeaveAllocation), 이월, 포상/근속 부여
- **스탬프/힐링데이**: 스탬프 적립 → 힐링데이 사용
- **알림**: 휴가 신청/승인/반려/취소 (알림톡 연동 가능)
- **감사 로그**: 휴가·할당 변경 등 이력

---

## 주요 소스 위치

- 메뉴 정의: `src/lib/menuConfig.ts`
- 휴가 규정 안내 페이지: `src/app/(main)/leave/policy/page.tsx`
- 휴가 비즈니스/계산: `src/lib/leave.ts`, `src/lib/leaveCalc.ts`, `src/lib/workdays.ts`
- 휴가 API: `src/app/api/leave/*`, `src/app/api/admin/leave-types/*`, `src/app/api/admin/allocations/*`
- 스케줄러(월별 발생/근속 체크): `src/lib/scheduler.ts`, `cron-runner.mjs`

---

---

## 관련 문서

- **함께 유지보수하기** (Cursor·Git·클라우드 공유): [`docs/COLLABORATION-MANUAL.md`](COLLABORATION-MANUAL.md)
- 배포: `docs/DEPLOYMENT.md` · 테스트: `docs/TESTING.md` · DB: `docs/DATABASE.md`

---

*이 문서는 코드베이스 인식 및 온보딩용입니다. 규정 상세는 앱 내 «휴가 규정» 메뉴를 참고하세요.*

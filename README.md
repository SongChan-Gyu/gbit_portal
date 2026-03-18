# GBIT Portal (지비아이티 포털)

휴가·연차 신청·결재, 스탬프 쿠폰, 근태 현황, 제주도 숙소 예약, 조직·사원 관리를 위한 내부 포털입니다.

**운영:** https://gbitportal-production.up.railway.app/

---

## 1. 로컬 실행 (Docker 없이)

- **MySQL:** 프로젝트에서 MySQL을 띄우지 않음. **이미 띄워져 있으면 그대로 두고**, 꺼져 있을 때만 사용자가 직접 `mysql.server start` 또는 `brew services start mysql` 로 띄움.
- **개발 서버:** `npm run dev` 한 번만 실행하면 됨. **이미 3000 포트에서 서버가 떠 있으면 다시 띄우지 않고**, 안 떠 있으면 그때만 띄움. 띄워 둔 동안에는 코드 변경이 자동 반영됨.

1. **.env**  
   `cp .env.example .env` 후 `DATABASE_URL` 비밀번호를 맥 MySQL root 비밀번호에 맞춤  
   예: `mysql://root:비밀번호@127.0.0.1:3306/hrm_web` (반드시 `127.0.0.1`, localhost 시 P1001 가능)
2. **최초 1회**  
   ```bash
   npm install
   npm run local:setup
   ```
3. **개발 서버** (MySQL은 이미 띄워 둔 상태에서)  
   ```bash
   npm run dev
   ```
   → http://localhost:3000

---

## 2. 클라우드 배포 (Railway)

- **대시보드:** https://railway.app  
- GitHub 저장소 연동 후 **main 브랜치 push 시 자동 빌드·배포** (Dockerfile 기준)
- **환경 변수** (Railway 대시보드 → 서비스 → Variables):
  - `DATABASE_URL` — MySQL 연결 문자열
  - `NEXTAUTH_URL` — 배포 도메인 (예: `https://xxx.railway.app`)
  - `NEXTAUTH_SECRET` — 32자 이상 랜덤 시크릿

배포 시 **DB는 기존 데이터 유지, 없는 것만 시드에서 insert** 하도록 되어 있음. (시드 로직 변경하지 말 것.)

---

## 3. 스크립트 정리

| 명령 | 용도 |
|------|------|
| `npm run dev` | 로컬 개발 서버 |
| `npm run dev:local` | prisma generate + migrate + seed 후 dev (최초/DB 초기화 시) |
| `npm run local:setup` | DB 생성 + migrate + seed 한 번에 (로컬 MySQL용) |
| `npm run build` | Next 빌드 |
| `npm run start` | 프로덕션 서버 (빌드 후) |
| `npm run start:prod` | migrate + seed 후 start (배포 서버용) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Prisma 클라이언트 생성 |
| `npm run db:push` | 스키마를 DB에 반영 (마이그레이션 없이) |
| `npm run db:seed` | 전체 시드 (휴가유형·휴일·샘플 사원 등) |
| `npm run db:seed:base` | 기초데이터만 (휴가유형 + 휴일 API 동기화) |
| `npm run db:migrate` | prisma migrate dev (스키마 변경 시) |
| `npm run db:studio` | Prisma Studio |
| `npm run verify:leave` | 휴가 규정·결재·할당 정합성 검증 |
| `npm run verify:data` | DB 연결·User/Employee/할당 usedDays 등 정합성 검증 |
| `npm run cron` | 스케줄러(월별 발생/근속 등) 실행 |

---

## 4. 프로젝트·기능 요약

- **기술:** Next.js 15 (App Router), React 19, Prisma, NextAuth v5, Tailwind CSS
- **휴가:** 귀속 5/1~익년 4/30, 연차/근속/경조/특별/반차, 팀장·PM 결재
- **제주도 숙소:** 달력 입실·퇴실 선택 → 신청, 복지부·PM 결재함, 카카오 지도(선택)
- **날짜:** 일자 연산·표시는 `YYYY-MM-DD` + `@/lib/dateUtils`(todayYMD, addDaysYMD, toYMD) 사용

**메뉴:** 대시보드, 휴가 신청/내 휴가/결재함/휴가 규정, 근태, 스탬프, 제주도 숙소(예약/신청 내역/결재함/숙소 정보/숙소 관리), 관리(인사·휴가 설정·휴가 관리·시스템 설정).

**요건·룰 정리:** 휴가/숙소/스탬프 규칙은 [REQUIREMENTS.md](./REQUIREMENTS.md) 참고. **요건이 바뀌면 반드시 REQUIREMENTS.md도 함께 수정**할 것.

---

## 5. 함께 유지보수 (Cursor · Git · Railway)

- **프로젝트 받기:** Cursor → Clone from Git → `https://github.com/SongChan-Gyu/gbit_portal.git`
- **Cursor:** 각자 계정 사용 (같은 아이디 동시 접속 불가)
- **Git:** 작업 전 `git pull`, 작업 후 `git add .` → `git commit -m "설명"` → `git push`
- **환경 변수·비밀:** `.env`는 Git에 올리지 말고, 팀 내부로만 공유. 클라우드는 Railway Variables에서 설정.
- **배포:** 한 명씩; 배포 전 `git pull` 후 push로 자동 배포.

---

## 6. 테스트·검증

```bash
npm run verify:leave   # 휴가 규정·할당 usedDays·결재 단계
npm run verify:data    # DB 연결·정합성
npm run build          # 빌드
npm run lint           # 린트
```

**수동 체크:** 휴가 신청/결재/취소, 제주 숙소 예약(입실·퇴실 선택)·결재, 스탬프·힐링데이, 인사 관리(사원 등록·엑셀).

---

## 7. 환경 변수 (.env.example 기준)

- `DATABASE_URL` — MySQL (로컬: `127.0.0.1` 권장)
- `NEXTAUTH_URL` — 배포 시 실제 도메인
- `NEXTAUTH_SECRET` — 운영 시 강한 랜덤 시크릿
- `NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY` — 제주 숙소 지도 (선택, Kakao Developers에서 JavaScript 키 + Web 도메인 등록)

**운영(클라우드) 이메일:** Railway 등 Variables에 `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` 입력. 회사 메일 서버(smtp.gmail.com / smtp.office365.com / smtp.naver.com 등)와 발신용 계정·비밀번호만 맞추면 됨. 자세한 예시는 `.env.example` 주석 참고.

**카카오 알림톡:** 카카오 비즈니스 채널 개설 후 알리고(Aligo)·비즈고 등 중계 서비스에서 연동·템플릿 검수 후 API 키 발급. `.env.example` 하단 주석에 설정 흐름 정리됨. 미설정 시 알림톡은 스킵되고 로그만 남음.

**요청(접속) 로그:** 운영 시 IP·메서드·URL 기록이 필요하면 `REQUEST_LOG_SECRET`을 설정. 미설정 시 API 요청 로그를 남기지 않음. 기록된 로그는 관리 > 시스템 설정 > 데이터에서 "요청(접속) 로그" 테이블로 조회 가능.

---

## 8. 스케줄러·백업 (클라우드)

**스케줄러:** 월별 연차 발생·근속 체크·생일반차 등은 **Next.js 앱과 별도 프로세스**인 `cron-runner.mjs`로 동작합니다. 클라우드에 웹 앱만 띄우면 스케줄러는 실행되지 않습니다. 다음 중 하나가 필요합니다.
- **방법 1:** 같은 프로젝트를 두 번째 서비스로 배포하고, 그 서비스에서는 `npm run cron`만 실행하도록 설정 (Railway 등에서 Run Command를 `node cron-runner.mjs`로 지정).
- **방법 2:** 외부 cron 서비스(cron-job.org, GitHub Actions 등)에서 매일 지정 시간에 `POST /api/cron/monthly-accrual`, `POST /api/cron/tenure-check` 등을 호출. 이때 `CRON_SECRET`을 Header `x-cron-secret`에 넣어야 함.
- **방법 3:** 서버/VM에서 systemd 또는 launchd로 `node cron-runner.mjs`를 백그라운드 서비스로 등록. (README 상단 cron-runner.mjs 주석 참고.)

**데이터 백업:** 클라우드 DB(PlanetScale, Railway MySQL 등)를 쓰더라도 **별도 백업**을 권장합니다. 제공업체의 자동 스냅샷만 믿지 말고, 주기적으로 `mysqldump` 또는 DB 서비스의 export 기능으로 덤프를 받아 두거나, 별도 백업 스크립트를 돌리는 것이 좋습니다. 마이그레이션 히스토리(`prisma/migrations`)는 Git에 있으므로, 덤프만 있으면 특정 시점으로 복구 가능합니다.

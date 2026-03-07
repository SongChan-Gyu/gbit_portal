# DB 구성 가이드

- 기본 DB는 **MySQL**이며, **Docker Compose**로 MySQL을 띄운 뒤 사용합니다. (운영 배포 시에도 동일한 Compose 사용 가능)
- `.env`의 `DATABASE_URL`이 MySQL을 가리키도록 설정되어 있습니다.
- 데이터는 **사용자가 수정하지 않으면 변경되지 않도록** 설계되어 있으며, 휴일만 API로 주기 동기화할 수 있습니다.

---

## 0. 개발 서버 한 번에 띄우기 (MySQL + 웹, 소스 자동 반영)

```bash
npm run dev:docker
# 또는
docker compose up
```

- **MySQL**과 **Next.js 개발 서버**가 같이 올라갑니다.
- 소스는 볼륨 마운트되어 있어 저장하면 **핫 리로드**로 바로 반영됩니다.
- 웹: http://localhost:3000  
- 백그라운드 실행: `docker compose up -d`

---

## 1. MySQL 실행 (Docker) 및 처음 초기화

**필수:** Docker Desktop(또는 Docker 엔진)이 실행 중이어야 합니다.

1. **한 번에 MySQL 기동 + 마이그레이션** (권장):

   ```bash
   npm run db:mysql:up
   ```

   - `docker compose up -d` 로 MySQL 컨테이너를 띄운 뒤, 준비될 때까지 대기하고 `prisma migrate dev --name init_mysql` 를 실행합니다.
   - 최초 실행 시 `prisma/migrations` 에 마이그레이션 파일이 생성됩니다.

2. **수동으로 할 때** (프로젝트 루트에서):

   ```bash
   docker compose up -d
   # MySQL이 healthy 될 때까지 대기 (docker compose ps 로 확인)
   npx prisma migrate dev --name init_mysql
   ```

   - DB 이름·root 비밀번호는 `docker-compose.yml` 환경변수 또는 기본값 사용 (`MYSQL_DATABASE=hrm_web`, `MYSQL_ROOT_PASSWORD=hrm_secret`).
   - 비밀번호 변경 시 `.env`의 `DATABASE_URL`과 `docker-compose.yml`의 `MYSQL_ROOT_PASSWORD`를 같이 맞춰야 합니다.

2. **MySQL 준비 대기** (healthcheck 통과 후):

   ```bash
   docker compose ps
   # mysql 서비스가 healthy 상태가 될 때까지 대기 (보통 15~30초)
   ```

3. **마이그레이션 적용** (테이블 생성):

   ```bash
   npx prisma generate
   npx prisma migrate dev --name init_mysql
   ```

   - 최초 1회: `prisma/migrations`에 마이그레이션 파일이 생성되고 MySQL에 테이블이 생성됩니다.
   - 이후 스키마 변경 시에는 `npx prisma migrate dev`로 마이그레이션을 추가·적용합니다.

4. **초기 데이터 넣기 (휴가유형·휴일·샘플 사원 등)**  
   - **전체 시드** (샘플 사원/팀/할당 포함):

     ```bash
     npm run db:seed
     ```

   - **기초데이터만** (휴가유형 + 휴일 API 동기화만, 사원/할당 없음):

     ```bash
     npm run db:seed:base
     ```

   실제 운영 시에는 `db:seed` 대신 **사원정보·휴가 부여·사용 내역만** 이관해서 쓰면 됩니다.

---

## 2. 기존 DB 내역으로 실행 (이미 데이터가 있는 경우)

- **마이그레이션/푸시만** 하고 시드는 돌리지 않습니다.
- 기존 테이블/데이터를 유지한 채 앱만 띄우는 경우:

  ```bash
  # 스키마가 이미 적용된 DB라면 생략 가능
  npx prisma db push

  # 앱 실행 (시드 실행 안 함)
  npm run dev
  # 또는
  npm run start
  ```

- **휴일만** 최신으로 갱신하고 싶을 때:
  - 관리자 로그인 후 **API 호출**:  
    `GET /api/admin/holidays/sync`  
    (현재·다음 귀속연도 범위로 휴일 API에서 받아와 DB에 반영)
  - 또는 **기초데이터 시드만** 실행 (휴가유형 + 휴일만, 사원/할당 미변경):

    ```bash
    npm run db:seed:base
    ```

---

## 3. 운영 배포 시 (도커로 올릴 때)

- 서버에서 **MySQL만** Docker로 띄우는 경우: 같은 `docker-compose.yml` 사용.
- `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`는 환경변수로 넣어서 비밀번호를 코드에 두지 않도록 합니다.
- 앱(Next.js)은 별도 컨테이너/호스트에서 실행하고, `DATABASE_URL`만 MySQL 주소로 맞춥니다. (같은 네트워크면 호스트명은 `mysql` 또는 서비스명 사용 가능)
- 마이그레이션은 배포 시 한 번: `npx prisma migrate deploy` (기존에 `prisma migrate dev`로 만든 마이그레이션 파일이 적용됨).

## 4. 스크립트 정리

| 스크립트 | 용도 |
|----------|------|
| `npm run db:mysql:up` | Docker MySQL 기동 후 `prisma migrate dev` 실행 (최초 1회 또는 마이그레이션 적용 시). |
| `npm run db:migrate` | `prisma migrate dev` (스키마 변경 후 마이그레이션 추가·적용). |
| `npm run db:push` | 스키마를 DB에 반영 (테이블 생성/수정). 마이그레이션 없이 푸시할 때만 사용. |
| `npm run db:seed` | **전체 시드** 실행 (휴가유형, 휴일 API 동기화, 샘플 팀/사원/계정/할당 등). 신규 DB 초기화·개발용. |
| `npm run db:seed:base` | **기초데이터만** (휴가유형 + 휴일 API 동기화). 사원·할당·신청 내역은 변경 없음. 기존 DB에 휴일/유형만 갱신할 때 사용. |
| `GET /api/admin/holidays/sync` | 휴일만 API에서 가져와 DB에 반영. 관리자 전용. |

---

## 5. 휴일 데이터

- 휴일은 **하드코딩하지 않고** [Nager.Date (한국 공휴일)](https://date.nager.at) API로 수집합니다.
- 시드 또는 `db:seed:base` 실행 시 **현재·다음 귀속연도**를 커버하는 연도 구간으로 API를 호출해 DB에 upsert 합니다.
- 관리자 API `GET /api/admin/holidays/sync?fromYear=2025&toYear=2027` 로 연도 구간을 지정해 동기화할 수도 있습니다.

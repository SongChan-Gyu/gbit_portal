# GBIT Portal (지비아이티 포털)

휴가·연차 신청·결재, 스탬프 쿠폰, 근태 현황, 조직·사원 관리를 위한 내부 포털입니다.

---

## 운영 사이트

**https://gbitportal-production.up.railway.app/**

---

## 함께 유지보수하기 (Cursor · Git · Railway)

여러 명이 Cursor로 작업하고, Git으로 코드 공유하고, Railway로 배포하는 방법은 아래 문서를 보세요.

→ **[docs/COLLABORATION-MANUAL.md](docs/COLLABORATION-MANUAL.md)**

- **처음 프로젝트 받을 때**: Cursor에서 **Clone from Git** → `https://github.com/SongChan-Gyu/gbit_portal.git` 넣고 클론
- **우리 팀 링크**: 운영 사이트 주소, Git 저장소, Railway 대시보드, 환경 변수 설정 위치
- **Cursor**: 각자 계정 사용 (같은 아이디 동시 접속 불가)
- **Git**: 작업 전 `git pull`, 작업 후 `commit` + `push`
- **Railway**: 배포·환경 변수는 Railway 대시보드에서 관리

---

## 로컬에서 실행

둘 중 편한 방식으로 하면 됩니다.

### 1) Docker로 한 번에 (MySQL + 앱 모두 컨테이너)

```bash
npm install
cp .env.example .env
npm run dev:docker
```

→ MySQL과 Next.js가 같이 뜹니다. [http://localhost:3000](http://localhost:3000) 접속.

**한 번이라도 이전에 Docker로 MySQL 띄운 적 있으면** 연결 오류 시 볼륨 삭제 후 다시: `docker compose down -v` 후 `npm run dev:docker`

### 2) 맥에 MySQL 이미 설치돼 있을 때 (Docker 없이)

1. **MySQL 서버 켜기**  
   `brew services start mysql` 또는 시스템 설정에서 MySQL 실행

2. **.env 설정**  
   `cp .env.example .env` 후 **`DATABASE_URL`의 비밀번호를 맥 MySQL root 비밀번호로 수정**  
   예: `mysql://root:본인비밀번호@127.0.0.1:3306/hrm_web`

3. **첫 설정 한 번에 하기** (DB 생성 + 마이그레이션 + 시드)
   ```bash
   npm install
   npm run local:setup
   ```
   → 실패하면 “비밀번호가 틀렸거나 MySQL이 꺼져 있을 수 있습니다” 메시지 확인. `.env` 비밀번호와 MySQL 실행 여부 확인 후 다시 실행.

4. **개발 서버 실행**
   ```bash
   npm run dev
   ```
   또는 `npm run dev:local` (migrate + seed 포함)

   → [http://localhost:3000](http://localhost:3000) 에서 실행됨.

---

## 문서

| 문서 | 설명 |
|------|------|
| [docs/COLLABORATION-MANUAL.md](docs/COLLABORATION-MANUAL.md) | Cursor·Git·Railway 함께 쓰기 매뉴얼 |
| [docs/PROJECT-OVERVIEW.md](docs/PROJECT-OVERVIEW.md) | 프로젝트 구조·메뉴·기능 개요 |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Railway 배포 가이드 |
| [docs/TESTING.md](docs/TESTING.md) | 테스트·데이터 정합성 검증 |

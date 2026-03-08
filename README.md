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

```bash
npm install
cp .env.example .env   # .env 값은 팀에서 공유받기
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속.

---

## 문서

| 문서 | 설명 |
|------|------|
| [docs/COLLABORATION-MANUAL.md](docs/COLLABORATION-MANUAL.md) | Cursor·Git·Railway 함께 쓰기 매뉴얼 |
| [docs/PROJECT-OVERVIEW.md](docs/PROJECT-OVERVIEW.md) | 프로젝트 구조·메뉴·기능 개요 |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Railway 배포 가이드 |
| [docs/TESTING.md](docs/TESTING.md) | 테스트·데이터 정합성 검증 |

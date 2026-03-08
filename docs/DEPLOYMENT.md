# Railway 운영 배포 가이드

이 프로젝트는 **Railway**에서 배포·운영합니다. GitHub 연동 후 main 푸시 시 자동 빌드·배포할 수 있습니다.

---

## 1. Railway 대시보드

- **대시보드**: [https://railway.app](https://railway.app)
- 로그인 후 **프로젝트** 선택 → **서비스**(Next.js 앱, MySQL 등)별로 설정·환경 변수·도메인 관리

---

## 2. 배포 흐름

| 단계 | 설명 |
|------|------|
| **GitHub 연동** | Railway 프로젝트에서 GitHub 저장소 연결 (예: `SongChan-Gyu/gbit_portal`) |
| **자동 배포** | `main` 브랜치에 push하면 Railway가 자동으로 빌드 후 배포 |
| **환경 변수** | Railway 대시보드 → 서비스 → **Variables** 에 `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` 등 설정 |

---

## 3. 운영 시 체크리스트 (배포 전)

- [ ] `NEXTAUTH_URL` = Railway에서 부여한 도메인 또는 커스텀 도메인 (예: `https://xxx.railway.app`)
- [ ] `NEXTAUTH_SECRET` = 강한 랜덤 시크릿 (32자 이상)
- [ ] `DATABASE_URL` = Railway MySQL(또는 사용 중인 DB) 연결 문자열
- [ ] DB 마이그레이션: 배포 시 `start:prod` 등에서 `prisma migrate deploy` 포함되어 있으면 자동 적용

---

## 4. 참고 (로컬·다른 환경)

- **Docker 로컬 실행**: `docker-compose.prod.yml` 이 있으면 로컬에서 운영 모드 테스트 가능.
- **다른 클라우드**(예: DigitalOcean)에 올리는 경우도 Dockerfile·환경변수만 맞추면 동일하게 배포 가능합니다.

---

요약: **Railway**에 GitHub 저장소 연동해 두면 push 시 자동 배포됩니다. 환경 변수는 Railway 대시보드 **Variables**에서 설정·공유하세요.

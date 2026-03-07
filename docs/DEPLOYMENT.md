# DigitalOcean 운영 배포 가이드

직원 약 50명 규모 기준입니다. 현재 구조 그대로 Docker로 올려도 됩니다.

---

## 1. 사양·트래픽

| 항목 | 권장 |
|------|------|
| **Droplet** | 2 vCPU / 2GB RAM 이상 (예: Basic $12~18/월). 50명 동시 접속이 많으면 4GB 권장 |
| **DB** | 같은 서버에서 MySQL 컨테이너 1개로 충분. 데이터 많아지면 DO Managed MySQL 검토 |
| **트래픽** | 50명 내부용이면 대역/요금 문제 거의 없음 |

정리하면, **Droplet 1대로 MySQL + Next.js 둘 다 Docker로 띄우면 50명 규모에는 문제 없습니다.**

---

## 2. 운영용 Docker (개발용과 구분)

지금 `docker-compose.yml`은 **개발용**(`next dev`, 소스 마운트)입니다. 운영에서는 다음이 필요합니다.

- **Next.js**: `next build` 후 `next start` (프로덕션 모드)
- **소스 마운트 제거** (이미지 안에 빌드 결과만 포함)
- **환경변수**: `NEXTAUTH_URL`, `NEXTAUTH_SECRET` 등 운영 값

이미지 두 종류를 쓰려면:

- **Dockerfile**: 개발용은 지금처럼 `npm run dev`, 운영용은 `npm run build && npm run start` 하는 스테이지/타겟 하나 더 두거나
- **docker-compose.prod.yml**: 운영 전용. `app`은 `Dockerfile`의 `prod` 타겟으로 `next build` 후 `next start` 실행.

프로젝트에 이미 포함된 것:
- **Dockerfile** `prod` 타겟: `next build` + `npm run start`
- **docker-compose.prod.yml**: MySQL + 앱, 환경변수만 채우면 `docker compose -f docker-compose.prod.yml up -d` 로 배포 가능

---

## 3. Git main 자동 배포 (나중에 설정할 때)

DigitalOcean 쪽 선택지입니다.

| 방식 | 설명 |
|------|------|
| **App Platform** | GitHub 연동 후 main 푸시 시 자동 빌드·배포. Dockerfile 지원. 관리 가장 쉬움. |
| **Droplet + GitHub Actions** | 서버는 직접 준비하고, main 푸시 시 Actions가 SSH로 접속해 `git pull` + `docker compose build && up` 실행. |

- “명령어 최소화”만 원하면 **App Platform**이 편하고,  
- 서버를 직접 쓰고 싶으면 **Droplet + Actions**로 `main` 푸시 시 자동 배포 파이프라인 만들면 됩니다.

지금 당장 설정하지 않아도 되고, 배포 시점에 위 두 가지 중 하나만 골라서 적용하면 됩니다.

---

## 4. 운영 시 체크리스트 (배포 전)

- [ ] `NEXTAUTH_URL` = 실제 도메인 (예: `https://hrm.회사도메인.com`)
- [ ] `NEXTAUTH_SECRET` = 강한 랜덤 시크릿 (32자 이상)
- [ ] `MYSQL_ROOT_PASSWORD` (또는 전용 DB 계정) = 안전한 비밀번호, 코드/공개 저장소에 없도록
- [ ] HTTPS: DO App Platform이면 기본 제공, Droplet이면 Nginx + Let’s Encrypt 또는 Caddy
- [ ] DB 백업: Droplet 사용 시 `mysqldump` 또는 DO Managed DB 백업 설정

---

요약: **50명 규모로 DigitalOcean에 Docker 그대로 올리는 건 문제 없고**, 운영용은 `next start` + 환경변수만 맞추면 됩니다. Git main 자동 배포는 나중에 App Platform 또는 GitHub Actions 중 하나로 붙이면 됩니다.

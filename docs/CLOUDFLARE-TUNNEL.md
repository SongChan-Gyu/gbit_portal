# 맥북 로컬 서버를 외부에서 접속하기 (테스트·공유용)

맥북에서 돌리는 Next.js 앱을 **다른 사람이 URL만으로 접속**해서 테스트하게 하려면, 터널을 쓰면 됩니다.  
서버는 맥북 그대로 두고, **공인 IP 입력 없이** 링크만 보내면 상대방이 바로 들어갈 수 있는 방법만 정리했습니다.

---

## ★ 다른 사람이 공인 IP 없이 접속해서 테스트하기 (요약)

**원하는 것:** 맥북에서 앱 실행 → 다른 사람한테 **URL만** 보내면 → 상대방이 **공인 IP 입력 없이** 그 주소로 접속.

**방법: ngrok 사용 (가입 필요, 무료)**

1. **한 번만 설정**
   - [ngrok.com](https://ngrok.com) 가입
   - 터미널: `brew install ngrok`
   - ngrok 대시보드에서 **Authtoken** 복사 후: `ngrok config add-authtoken 여기에붙여넣기`

2. **테스트할 때마다**
   - **터미널 1:** `npm run dev` (앱 실행)
   - **터미널 2:** `npm run tunnel:ngrok`
   - 터미널에 나오는 **https://xxxx.ngrok.io** 주소를 복사해서 상대방한테 전달

3. **상대방**
   - 그 링크만 열면 됨. **공인 IP 입력 같은 절차 없음.**

4. **로그인까지 테스트하려면**
   - `npm run tunnel:ngrok` 실행 후 `.env.local`의 `NEXTAUTH_URL`이 자동으로 그 URL로 바뀜.  
   - 이미 켜 둔 Next 서버는 **한 번 재시작**하면 로그인도 그 주소 기준으로 동작함.

※ 나중에 **본인 도메인**을 사면, Cloudflare Named Tunnel이나 ngrok 유료로 그 도메인을 맥북 터널에 연결해서 쓸 수 있음. 지금은 ngrok 무료로 받는 `xxxx.ngrok.io` 주소만 써도 “도메인(URL)으로 접속해서 테스트”하는 용도로 충분함.

---

## 1. cloudflared 설치 (맥)

```bash
# Homebrew
brew install cloudflared
```

또는 [Cloudflare Zero Trust 문서](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)에서 직접 다운로드.

---

## 2. Quick Tunnel (가장 쉬운 방법)

로컬에서 앱을 띄운 뒤, 터널만 실행하면 됩니다.

**터미널 1 – Next.js 서버**

```bash
cd /Users/gyu/hrm-web
npm run dev
# 기본 주소: http://localhost:3000
```

**터미널 2 – 터널**

```bash
cloudflared tunnel --url http://localhost:3000
```

실행하면 예시처럼 **임시 URL**이 출력됩니다.

```
Your quick Tunnel has been created! Visit it at:
https://xxxx-xx-xx-xx-xx.xx.trycloudflare.com
```

이 URL로 접속하면 로컬 `http://localhost:3000`이 외부에 공개됩니다.  
세션 종료 시 URL은 사라지고, 다시 실행하면 새 URL이 발급됩니다.

---

## 3. (선택) 고정 도메인 – Named Tunnel

동일한 URL을 계속 쓰려면 Cloudflare 대시보드에서 터널을 만들고, `cloudflared`에 로그인해 연결합니다.

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels** → **Create a tunnel**
2. 터널 이름 지정 후 **cloudflared** 방식 선택
3. 설치 안내에 따라 로컬에서 `cloudflared tunnel login` 및 `cloudflared tunnel run <TUNNEL_ID>` 실행
4. **Public Hostname**에서 원하는 서브도메인(예: `hrm-dev.yourdomain.com`)을 이 터널로 연결하고, **Service**를 `http://localhost:3000`으로 설정

상세 절차는 [Cloudflare Tunnel 문서](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)를 참고하면 됩니다.

---

## 4. NextAuth 등 인증(로그인) 사용 시

터널 URL로 접속했을 때 **로그인이 되려면** 다음이 필요합니다.

- **NEXTAUTH_URL**: 터널 URL로 설정 (예: `https://xxxx.loca.lt`). `npm run tunnel` 실행 시 `.env.local`에 자동 반영됩니다.
- **trustHost**: 이 프로젝트의 `src/lib/auth.ts`에 `trustHost: true`가 설정되어 있어, 터널/프록시 도메인에서도 로그인·콜백이 동작합니다.
- 터널 URL을 바꾼 뒤에는 **Next.js 서버를 한 번 재시작**해야 새 `NEXTAUTH_URL`이 적용됩니다.

---

## 5. 터널 URL을 소스에서 자동으로 쓰기 (권장)

프로젝트에 **터널 실행 + 생성된 URL을 `.env.local`의 `NEXTAUTH_URL`에 자동 반영**하는 스크립트가 있습니다.

1. **로컬 서버 실행** (한 터미널)
   ```bash
   npm run dev
   ```

2. **터널 실행** (다른 터미널)
   ```bash
   npm run tunnel
   ```
   - 기본값: **LocalTunnel** 사용 (`https://xxxx.loca.lt`). Cloudflare Quick Tunnel이 500 에러일 때도 동작합니다.
   - **LocalTunnel 첫 접속 시** "IP 주소를 입력하세요" 페이지가 뜨면, `npm run tunnel` 실행 시 터미널에 출력된 **공인 IP**를 그대로 입력하면 됩니다 (스크립트가 자동 조회해 표시). IP를 잊었다면 터미널에서 `curl -s https://api.ipify.org` 로 확인 가능.
   - **다른 사람한테 테스트 페이지 보여줄 때** (IP 입력 없이 링크만 공유): **ngrok** 사용을 권장합니다. `npm run tunnel:ngrok` (사전: [ngrok.com](https://ngrok.com) 가입 → `brew install ngrok` → `ngrok config add-authtoken <토큰>`). 생성된 URL만 보내면 상대방이 바로 접속 가능합니다.
   - 터널이 뜨면 생성된 URL을 **자동으로** `.env.local`의 `NEXTAUTH_URL`에 넣습니다.
   - 이미 떠 있는 Next.js 서버는 **한 번 재시작**하면 새 URL이 반영됩니다 (환경변수 변경 적용).
   - Cloudflare만 쓰고 싶다면: `npm run tunnel:cloudflare` (Cloudflare API 정상일 때만 URL 발급됨).

이렇게 하면 터널 URL을 수동으로 복사해 넣을 필요 없이, 터널만 띄우면 앱이 그 URL 기준으로 동작합니다.

---

## 6. 용도별 선택

| 용도 | 추천 | 비고 |
|------|------|------|
| **나만 테스트** | `npm run tunnel` (LocalTunnel) | 첫 접속 시 공인 IP 한 번 입력 |
| **다른 사람한테 링크만 보내서 보여주기** | `npm run tunnel:ngrok` (ngrok) | IP 입력 없음, 링크만 공유하면 됨 (ngrok 가입 필요) |

둘 다 **테스트용**이면 “링크 아는 사람만 접속”이라는 점은 같고, ngrok이 상대방 입장에선 더 편합니다. 테스트 데이터만 넣고 링크를 필요한 사람한테만 보내면 됩니다.

---

## 7. 한 줄 요약

```bash
# 서버 실행 후 다른 터미널에서
npm run tunnel
# 또는 수동: cloudflared tunnel --url http://localhost:3000
```

- **IP 입력 없이 링크만 공유:** `npm run tunnel:ngrok` (ngrok 사전 설정 후)
- **가입 없이:** `npm run tunnel` (LocalTunnel, 첫 접속 시 IP 입력)

---

## 8. 도메인으로 실행·접속하기

**내 도메인(예: hrm.회사도메인.com)으로 접속해서 쓰고 싶을 때** 선택지는 두 가지입니다.

### 8-1. 서버에 배포 후 도메인 연결 (실제 운영용)

1. **앱을 서버에 띄우기**  
   - 클라우드( AWS, GCP, Azure 등 ) 또는 VM/리눅스 서버에 프로젝트를 배포하고, `npm run build` → `npm run start` (또는 PM2 등으로) 실행해 둡니다.  
   - 포트 예: 3000 (또는 원하는 포트).

2. **도메인 DNS 설정**  
   - 사용할 도메인(예: `hrm.company.com`)의 DNS에서 **A 레코드** 또는 **CNAME**을, 앱이 떠 있는 서버 IP(또는 로드밸런서/프록시 주소)로 연결합니다.

3. **HTTPS(SSL)**  
   - Nginx 등 리버스 프록시 앞단에서 Let’s Encrypt 등으로 SSL 발급 후, 443 → 3000 포트로 프록시합니다.

4. **환경 변수**  
   - 서버의 `.env` 또는 `.env.production`에 다음을 설정합니다.  
     - `NEXTAUTH_URL=https://hrm.company.com`  
     - (필요 시) `NEXTAUTH_SECRET`, `DATABASE_URL` 등.

5. **실행**  
   - 사용자는 브라우저에서 `https://hrm.company.com` 으로 접속하면 됩니다.

---

### 8-2. 터널 + 고정 도메인 (테스트·개발용, 별도 서버 없이)

로컬(또는 이미 떠 있는 서버)만 있고, **고정 도메인**으로만 접속하고 싶을 때 사용합니다.

**A. Cloudflare Named Tunnel (무료, 본인 도메인 필요)**

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → **Networks** → **Tunnels** → **Create a tunnel**  
2. 터널 이름 지정(예: `hrm-dev`) → **cloudflared** 설치 안내대로 로컬에서 `cloudflared tunnel login` 후 `cloudflared tunnel run <TUNNEL_ID>` 실행  
3. **Public Hostname** 추가:  
   - Subdomain: `hrm` (또는 원하는 이름)  
   - Domain: Cloudflare에 넣어 둔 본인 도메인 (예: `company.com`)  
   - Service: `http://localhost:3000` (또는 앱이 떠 있는 주소)  
4. `.env.local`에 `NEXTAUTH_URL=https://hrm.company.com` 설정 후 Next 서버 재시작  
5. 접속: **https://hrm.company.com** → 로컬(또는 해당 서버) 앱으로 연결됩니다.

**B. ngrok 고정 도메인 (유료)**

- ngrok 유료 플랜에서 **Custom Domain**을 지정한 뒤, 해당 도메인으로 터널을 띄우면 고정 URL로 접속 가능합니다.  
- `NEXTAUTH_URL`을 그 고정 URL로 맞추면 됩니다.

---

**요약**

| 목적 | 방법 |
|------|------|
| **실제 서비스(운영)** | 서버 배포 → DNS로 도메인 연결 → HTTPS 설정 → `NEXTAUTH_URL`에 해당 도메인 설정 |
| **테스트/개발, 본인 도메인 사용** | Cloudflare Named Tunnel로 `https://서브도메인.본인도메인` 고정 후, 그 주소를 `NEXTAUTH_URL`로 사용 |

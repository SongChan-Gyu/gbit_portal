# 이메일 발송 설정 (초대 메일 등)

초대 메일을 보내려면 **SMTP** 환경 변수를 설정해야 합니다.

## 1. `.env` 또는 `.env.local`에 추가

```env
# SMTP (Gmail / Naver / 회사 메일 등)
SMTP_HOST=smtp.naver.com
SMTP_PORT=587
SMTP_USER=네이버아이디@naver.com
SMTP_PASS=네이버_앱비밀번호
SMTP_FROM=네이버아이디@naver.com
```

- **Naver**: [네이버 메일 → 환경설정 → POP3/IMAP] 에서 IMAP 사용함, [내 계정 → 2단계 인증] 후 **앱 비밀번호** 발급해서 `SMTP_PASS`에 넣기.
- **Gmail**: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, 구글 계정에서 앱 비밀번호 사용.

## 2. 테스트 시 내 메일로만 받기

실제 사원 이메일 대신 **항상 내 주소로** 보내서 테스트하려면:

```env
TEST_EMAIL_OVERRIDE=zx2253@naver.com
```

이렇게 설정하면 초대 메일이 **사원 이메일이 아니라 위 주소**로만 발송됩니다. 운영 시에는 이 변수를 비우거나 삭제하면 됩니다.

## 요약

| 변수 | 설명 |
|------|------|
| `SMTP_HOST` | SMTP 서버 주소 (예: smtp.naver.com) |
| `SMTP_PORT` | 보통 587 (TLS) 또는 465 (SSL) |
| `SMTP_USER` | 로그인 이메일 |
| `SMTP_PASS` | 비밀번호 또는 앱 비밀번호 |
| `SMTP_FROM` | (선택) 발신 주소, 없으면 SMTP_USER 사용 |
| `TEST_EMAIL_OVERRIDE` | (선택) 테스트 시 수신 주소 고정 (예: zx2253@naver.com) |

설정 후 **개발 서버 재시작**이 필요할 수 있습니다.

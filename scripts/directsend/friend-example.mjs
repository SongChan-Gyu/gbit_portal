#!/usr/bin/env node
/**
 * 다이렉트센드 카카오 친구톡 발송 예시 (PHP directsend_kakao_friend_php_api.php 와 동일 API)
 *
 * 사용:
 *   DIRECTSEND_USERNAME=아이디 DIRECTSEND_API_KEY=키 \
 *   DIRECTSEND_KAKAO_PLUS_ID='@채널' DIRECTSEND_USER_TEMPLATE_NO=템플릿번호 \
 *   DIRECTSEND_TEST_MOBILE=01012345678 \
 *   node scripts/directsend/friend-example.mjs
 *
 * 친구톡은 야간 등 발송 제한이 있음(다이렉트센드 안내 참고).
 */

const URL = "https://directsend.co.kr/index.php/api_v2/kakao_friend";

const username = process.env.DIRECTSEND_USERNAME;
const key = process.env.DIRECTSEND_API_KEY;
const kakao_plus_id = process.env.DIRECTSEND_KAKAO_PLUS_ID;
const user_template_no = process.env.DIRECTSEND_USER_TEMPLATE_NO;
const mobile = process.env.DIRECTSEND_TEST_MOBILE;

if (!username || !key || !kakao_plus_id || !user_template_no || !mobile) {
  console.error(
    "필수 환경변수: DIRECTSEND_USERNAME, DIRECTSEND_API_KEY, DIRECTSEND_KAKAO_PLUS_ID, DIRECTSEND_USER_TEMPLATE_NO, DIRECTSEND_TEST_MOBILE",
  );
  process.exit(1);
}

const body = {
  username,
  key,
  kakao_plus_id,
  user_template_no,
  receiver: [
    {
      name: "테스트",
      mobile,
      note1: "비고1",
      note2: "비고2",
      note3: "비고3",
      note4: "비고4",
      note5: "비고5",
    },
  ],
};

const res = await fetch(URL, {
  method: "POST",
  headers: {
    "cache-control": "no-cache",
    "content-type": "application/json; charset=utf-8",
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(60_000),
});

const text = await res.text();
console.log("HTTP", res.status);
console.log(text);

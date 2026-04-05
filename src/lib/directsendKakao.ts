/**
 * 다이렉트센드(DirectSend) 카카오 알림톡·친구톡 API — Node/Next에서 fetch 호출용
 * 샘플은 PHP SDK와 동일 엔드포인트·JSON 본문 (다운로드 예시 기준).
 *
 * 실행 예시: scripts/directsend/alimtalk-example.mjs, friend-example.mjs
 */

const JSON_HEADERS = {
  "cache-control": "no-cache",
  "content-type": "application/json; charset=utf-8",
} as const;

export type DirectsendKakaoReceiver = {
  name?: string;
  mobile: string;
  note1?: string;
  note2?: string;
  note3?: string;
  note4?: string;
  note5?: string;
};

export type DirectsendCredentials = {
  username: string;
  key: string;
};

/** 알림톡 즉시 발송 (api_v2/kakao_notice) */
export async function directsendKakaoAlimtalk(params: {
  credentials: DirectsendCredentials;
  kakaoPlusId: string;
  userTemplateNo: string;
  receiver: DirectsendKakaoReceiver[];
  /** 주소록 번호 콤마 구분 (receiver 대신 사용 시 API 문서 참고) */
  addressBooks?: string;
  duplicateYn?: 0 | 1;
  kakaoFaildType?: "1" | "2" | "3";
  title?: string;
  message?: string;
  sender?: string;
  reserveType?: "NORMAL" | "ONETIME" | "WEEKLY" | "MONTHLY";
  startReserveTime?: string;
  endReserveTime?: string;
  remainedCount?: number;
  returnUrlYn?: boolean;
  returnUrl?: number;
  attaches?: unknown;
}): Promise<{ ok: boolean; status: number; raw: string; json: unknown }> {
  const url = "https://directsend.co.kr/index.php/api_v2/kakao_notice";
  const body: Record<string, unknown> = {
    username: params.credentials.username,
    key: params.credentials.key,
    kakao_plus_id: params.kakaoPlusId,
    user_template_no: params.userTemplateNo,
    receiver: params.receiver,
  };
  if (params.addressBooks != null) body.address_books = params.addressBooks;
  if (params.duplicateYn != null) body.duplicate_yn = String(params.duplicateYn);
  if (params.kakaoFaildType != null) body.kakao_faild_type = params.kakaoFaildType;
  if (params.title != null) body.title = params.title;
  if (params.message != null) body.message = params.message;
  if (params.sender != null) body.sender = params.sender;
  if (params.reserveType != null) body.reserve_type = params.reserveType;
  if (params.startReserveTime != null) body.start_reserve_time = params.startReserveTime;
  if (params.endReserveTime != null) body.end_reserve_time = params.endReserveTime;
  if (params.remainedCount != null) body.remained_count = params.remainedCount;
  if (params.returnUrlYn != null) body.return_url_yn = params.returnUrlYn;
  if (params.returnUrl != null) body.return_url = params.returnUrl;
  if (params.attaches != null) body.attaches = params.attaches;

  const res = await fetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    // non-JSON 응답
  }
  const apiStatus = (json as { status?: number | string } | null)?.status;
  const ok = res.ok && (apiStatus === 1 || apiStatus === "1");
  return { ok, status: res.status, raw, json };
}

/** 친구톡 (api_v2/kakao_friend) — 템플릿 번호만 쓰는 최소 케이스 */
export async function directsendKakaoFriend(params: {
  credentials: DirectsendCredentials;
  kakaoPlusId: string;
  userTemplateNo: string;
  receiver: DirectsendKakaoReceiver[];
  addressBooks?: string;
  duplicateYn?: 0 | 1;
  kakaoFriendType?: 1 | 2;
  templateAd?: 0 | 1;
  templateTitle?: string;
  templateBody?: string;
  templateButtons?: unknown;
  templateImgAttach?: string;
  templateImgLink?: string;
  kakaoFaildType?: "1" | "2" | "3";
  title?: string;
  message?: string;
  sender?: string;
}): Promise<{ ok: boolean; status: number; raw: string; json: unknown }> {
  const url = "https://directsend.co.kr/index.php/api_v2/kakao_friend";
  const body: Record<string, unknown> = {
    username: params.credentials.username,
    key: params.credentials.key,
    kakao_plus_id: params.kakaoPlusId,
    user_template_no: params.userTemplateNo,
    receiver: params.receiver,
  };
  if (params.addressBooks != null) body.address_books = params.addressBooks;
  if (params.duplicateYn != null) body.duplicate_yn = String(params.duplicateYn);
  if (params.kakaoFriendType != null) body.kakao_friend_type = params.kakaoFriendType;
  if (params.templateAd != null) body.template_ad = params.templateAd;
  if (params.templateTitle != null) body.template_title = params.templateTitle;
  if (params.templateBody != null) body.template_body = params.templateBody;
  if (params.templateButtons != null) body.template_buttons = params.templateButtons;
  if (params.templateImgAttach != null) body.template_img_attach = params.templateImgAttach;
  if (params.templateImgLink != null) body.template_img_link = params.templateImgLink;
  if (params.kakaoFaildType != null) body.kakao_faild_type = params.kakaoFaildType;
  if (params.title != null) body.title = params.title;
  if (params.message != null) body.message = params.message;
  if (params.sender != null) body.sender = params.sender;

  const res = await fetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    // ignore
  }
  const apiStatus = (json as { status?: number } | null)?.status;
  const ok = res.ok && apiStatus === 1;
  return { ok, status: res.status, raw, json };
}

/** 발신 프로필 목록 (api_kakao/profile/get/list) */
export async function directsendKakaoProfileList(
  credentials: DirectsendCredentials,
  profileType: string = "1",
): Promise<{ ok: boolean; status: number; raw: string; json: unknown }> {
  const url = "https://directsend.co.kr/index.php/api_kakao/profile/get/list";
  const res = await fetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      username: credentials.username,
      key: credentials.key,
      profile_type: profileType,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    // ignore
  }
  const result = (json as { result?: number } | null)?.result;
  const ok = res.ok && result === 1;
  return { ok, status: res.status, raw, json };
}

/**
 * 템플릿 목록 (api_kakao/template/get/list)
 * template_type: PHP 주석 기준 알림톡 3, 친구톡 4
 */
export async function directsendKakaoTemplateList(
  credentials: DirectsendCredentials,
  templateType: "3" | "4",
): Promise<{ ok: boolean; status: number; raw: string; json: unknown }> {
  const url = "https://directsend.co.kr/index.php/api_kakao/template/get/list";
  const res = await fetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      username: credentials.username,
      key: credentials.key,
      template_type: templateType,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    // ignore
  }
  const result = (json as { result?: number } | null)?.result;
  const ok = res.ok && result === 1;
  return { ok, status: res.status, raw, json };
}

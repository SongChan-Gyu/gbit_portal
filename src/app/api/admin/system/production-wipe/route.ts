import { NextResponse } from "next/server";

/**
 * 운영 초기화 기능은 서버 가동 후 영구 비활성화되었습니다.
 * 이 엔드포인트는 모든 요청을 차단합니다.
 */
export async function POST() {
  return NextResponse.json(
    { error: "운영 초기화 기능은 비활성화되었습니다." },
    { status: 410 },
  );
}

import { NextResponse } from "next/server";

/**
 * 카카오 지도 JavaScript 키를 런타임에 반환.
 * NEXT_PUBLIC_ 은 빌드 시점에만 주입되므로, 배포 후 env만 넣은 경우 클라이언트에서 undefined가 됨.
 * 이 API로 키를 넘겨주면 재배포 없이 env만 설정해도 지도가 동작함.
 * (JavaScript 키는 도메인 제한으로 보호되므로 노출되어도 됨)
 */
export async function GET() {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY?.trim() ?? "";
  return NextResponse.json({ kakaoMapKey: key });
}

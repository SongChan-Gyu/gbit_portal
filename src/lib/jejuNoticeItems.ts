import type { DB } from "@/lib/db";

export const JEJU_NOTICE_ITEMS_CONFIG_KEY = "jejuNoticeItems";

export const DEFAULT_JEJU_NOTICE_ITEMS: string[] = [
  "기준 인원 4명, 최대 숙박 인원 6명(어린이·영유아 포함)입니다.",
  "애견동반(소형견)은 사전 연락 후 가능합니다.",
  "예약 인원 외 방문자는 입실 불가합니다.",
  "실내 공간 금연입니다.",
  "외부 주차장 CCTV가 설치되어 있습니다.",
  "화재 예방을 위해 향초, 불꽃놀이 등 사용을 금합니다.",
  "실내에서 고기·생선 구이, 튀김 등 냄새가 심한 요리는 금합니다.",
  "실내·외 시설 및 비치된 물건(비품, 침구, 수건 등) 훼손·분실·파손·오염 시 복구 비용을 부담하셔야 합니다.",
  "게스트 부주의로 인한 안전사고, 귀중품 분실·파손에 대해서는 호스트 책임이 없습니다.",
  "문제 발생 시 당황하지 마시고 담당자에게 연락 부탁드립니다.",
  "밤 10시 이후 고성, 바베큐 등 주변에 피해가 되지 않도록 부탁드립니다.",
  "상업적 사진·영상 촬영(광고, 제품 사진 등)은 사전 협의 후 진행해 주세요.",
];

const MAX_ITEMS = 50;
const MAX_ITEM_LENGTH = 500;

export function sanitizeJejuNoticeItems(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new Error("이용주의사항은 문자열 배열이어야 합니다.");
  }
  const items = raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_ITEMS)
    .map((text) => text.slice(0, MAX_ITEM_LENGTH));
  if (items.length === 0) {
    throw new Error("이용주의사항은 최소 1개 이상 필요합니다.");
  }
  return items;
}

export async function getJejuNoticeItems(db: DB): Promise<string[]> {
  try {
    const row = await db.systemConfig.findUnique({ where: { key: JEJU_NOTICE_ITEMS_CONFIG_KEY } });
    if (!row?.value) return [...DEFAULT_JEJU_NOTICE_ITEMS];
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [...DEFAULT_JEJU_NOTICE_ITEMS];
    const items = parsed
      .filter((x: unknown): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter(Boolean);
    return items.length > 0 ? items : [...DEFAULT_JEJU_NOTICE_ITEMS];
  } catch {
    return [...DEFAULT_JEJU_NOTICE_ITEMS];
  }
}

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  getJejuNoticeItems,
  JEJU_NOTICE_ITEMS_CONFIG_KEY,
  sanitizeJejuNoticeItems,
} from "@/lib/jejuNoticeItems";

/** GET — ADMIN: 현재 이용주의사항 목록 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role?: string };
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "관리자만 조회할 수 있습니다." }, { status: 403 });
  }
  const items = await getJejuNoticeItems(prisma);
  return NextResponse.json({ items });
}

/** PUT — ADMIN: 이용주의사항 전체 저장 (추가·삭제·변경) */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as { role?: string };
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "관리자만 수정할 수 있습니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { items?: unknown };
  let items: string[];
  try {
    items = sanitizeJejuNoticeItems(body.items);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "이용주의사항 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    await prisma.systemConfig.upsert({
      where: { key: JEJU_NOTICE_ITEMS_CONFIG_KEY },
      create: { key: JEJU_NOTICE_ITEMS_CONFIG_KEY, value: JSON.stringify(items) },
      update: { value: JSON.stringify(items) },
    });
  } catch (e) {
    console.error("[jeju-notice-items] save failed:", e);
    return NextResponse.json({ error: "저장에 실패했습니다. 관리자에게 문의해 주세요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, items });
}

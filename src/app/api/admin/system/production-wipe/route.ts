import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  executeProductionWipe,
  getProductionWipePreview,
  parseKeepUsernamesFromInput,
} from "@/lib/productionWipe";
import { PRODUCTION_WIPE_CONFIRM_PHRASE } from "@/lib/productionWipeConstants";

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "관리자만 사용할 수 있습니다." }, { status: 403 });
  }

  const userId = (session!.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ error: "세션이 올바르지 않습니다." }, { status: 401 });
  }

  let body: { action?: string; keepUsernames?: string; confirmPhrase?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const keepList = parseKeepUsernamesFromInput(
    typeof body.keepUsernames === "string" ? body.keepUsernames : undefined,
  );

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, passwordHash: true },
  });
  if (!me) {
    return NextResponse.json({ error: "로그인 사용자를 찾을 수 없습니다." }, { status: 401 });
  }
  if (!keepList.includes(me.username)) {
    return NextResponse.json(
      {
        error: `유지할 아이디 목록에 본인 계정(${me.username})을 반드시 포함하세요.`,
      },
      { status: 400 },
    );
  }

  if (body.action === "preview") {
    try {
      const { counts, keep } = await getProductionWipePreview(keepList);
      return NextResponse.json({ counts, keep, confirmPhrase: PRODUCTION_WIPE_CONFIRM_PHRASE });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "미리보기 실패";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  if (body.action === "execute") {
    const phrase = typeof body.confirmPhrase === "string" ? body.confirmPhrase.trim() : "";
    if (phrase !== PRODUCTION_WIPE_CONFIRM_PHRASE) {
      return NextResponse.json({ error: "확인 문구가 일치하지 않습니다." }, { status: 400 });
    }
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) {
      return NextResponse.json({ error: "관리자 비밀번호를 입력하세요." }, { status: 400 });
    }
    const valid = await bcrypt.compare(password, me.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 401 });
    }

    try {
      const { keep } = await executeProductionWipe(keepList);
      return NextResponse.json({ ok: true, keep });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "초기화 실패";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "action은 preview 또는 execute 여야 합니다." }, { status: 400 });
}

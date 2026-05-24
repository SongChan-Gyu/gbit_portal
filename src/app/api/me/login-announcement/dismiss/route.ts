import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { dismissUntilForType } from "@/lib/loginAnnouncements";

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user as { employeeId?: string } | undefined;
  if (!u?.employeeId) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const announcementId = String(body.announcementId ?? "");
  const dismissType = body.dismissType === "WEEK" ? "WEEK" : null;
  if (dismissType !== "WEEK") {
    return NextResponse.json({ error: "dismissType은 WEEK만 지원합니다." }, { status: 400 });
  }
  if (!announcementId) {
    return NextResponse.json({ error: "announcementId가 필요합니다." }, { status: 400 });
  }

  const exists = await prisma.loginAnnouncement.findUnique({
    where: { id: announcementId },
    select: { id: true },
  });
  if (!exists) return NextResponse.json({ error: "공지를 찾을 수 없습니다." }, { status: 404 });

  const dismissedUntil = dismissUntilForType(dismissType);
  await prisma.loginAnnouncementDismiss.upsert({
    where: {
      announcementId_employeeId: { announcementId, employeeId: u.employeeId },
    },
    create: {
      announcementId,
      employeeId: u.employeeId,
      dismissType,
      dismissedUntil,
    },
    update: { dismissType, dismissedUntil },
  });

  return NextResponse.json({ ok: true });
}

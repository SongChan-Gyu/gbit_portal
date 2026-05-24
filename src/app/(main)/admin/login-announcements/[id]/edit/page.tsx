import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/db";
import LoginAnnouncementEditor from "../../LoginAnnouncementEditor";
import type { AudienceCode } from "@/lib/audienceAccess";

export const metadata = { title: "로그인 팝업 수정 | GBIT Portal" };

export default async function EditLoginAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  if (!["PM", "ADMIN"].includes(user?.role ?? "")) redirect("/dashboard");

  const { id } = await params;
  const row = await prisma.loginAnnouncement.findUnique({ where: { id } });
  if (!row) notFound();

  return (
    <div className="max-w-3xl">
      <h1 className="page-title mb-6">로그인 팝업 수정</h1>
      <LoginAnnouncementEditor
        announcementId={id}
        initial={{
          title: row.title,
          body: row.body,
          audience: row.audience as AudienceCode,
          employeeGroupId: row.employeeGroupId,
          startsAt: row.startsAt?.toISOString() ?? null,
          endsAt: row.endsAt?.toISOString() ?? null,
          priority: row.priority,
          detailMode: row.detailMode,
          noticeId: row.noticeId,
          isActive: row.isActive,
        }}
      />
    </div>
  );
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { canAccessSettings } from "@/lib/authGuard";
import { employeesForFormAlimtalk, audienceLabel } from "@/lib/formAccess";
import { formatFormSubmitDeadlineLabel } from "@/lib/formSubmitDeadline";
import FormAlimtalkClient from "./FormAlimtalkClient";

export const metadata = { title: "양식 알림 발송 | GBIT Portal" };

export default async function FormAlimtalkPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const user = session?.user as any;
  if (!canAccessSettings(user)) redirect("/dashboard");

  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      slug: true,
      audience: true,
      employeeGroupId: true,
      isActive: true,
      submitDeadline: true,
      employeeGroup: { select: { name: true } },
    },
  });
  if (!form) redirect("/admin/forms");

  const audience = form.audience ?? "ALL";

  const employees = await employeesForFormAlimtalk(prisma, {
    audience,
    targetGroupId: form.employeeGroupId,
  });

  // 이 양식에 대한 최근 발송 로그 (FORM_REMINDER)
  const logs = await prisma.notificationLog.findMany({
    where: { templateCode: "FORM_REMINDER" },
    select: { targetId: true, sentAt: true, status: true, params: true },
    orderBy: { sentAt: "desc" },
    take: 2000,
  });

  const origin =
    process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "https://www.gbitportal.co.kr";
  const formUrl = form.slug ? `${origin}/f/${form.slug}` : `${origin}/forms/${id}`;

  // 이 양식 발송 이력
  const lastSentByEmployee: Record<string, string> = {};
  for (const l of logs) {
    if (lastSentByEmployee[l.targetId]) continue;
    try {
      const p = JSON.parse(l.params ?? "{}") as Record<string, string>;
      if ((p["링크"]?.includes(form.slug ?? id) || p["링크경로"]?.includes(form.slug ?? id)) && l.sentAt) {
        lastSentByEmployee[l.targetId] = new Date(l.sentAt).toISOString();
      }
    } catch { /* skip */ }
  }

  // 이 양식을 제출한 직원 ID 목록
  const submissions = await prisma.formSubmission.findMany({
    where: { formId: id },
    select: { employeeId: true },
  });
  const submittedEmployeeIds = new Set(submissions.map((s) => s.employeeId).filter(Boolean) as string[]);

  const submitDeadlineLabel = formatFormSubmitDeadlineLabel(form.submitDeadline);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/admin/forms" className="text-sm text-gray-500 hover:text-gray-700">
          ← 양식 관리
        </Link>
        <h1 className="page-title mt-2">{form.title} · 알림 발송</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          대상: {audienceLabel(audience, form.employeeGroup?.name ?? null)} ·{" "}
          {form.isActive ? "활성" : "비활성"} · {formUrl}
          {form.submitDeadline && <> · 제출 유효기간 {submitDeadlineLabel}</>}
        </p>
      </div>

      <FormAlimtalkClient
        formId={id}
        formTitle={form.title}
        formUrl={formUrl}
        submitDeadlineLabel={submitDeadlineLabel}
        hasSubmitDeadline={!!form.submitDeadline}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          phone: e.phone,
          employeeType: e.employeeType,
          alimtalkEnabled: e.alimtalkEnabled,
          teamName: e.team?.name ?? null,
          position: e.position,
          lastSentAt: lastSentByEmployee[e.id] ?? null,
          submitted: submittedEmployeeIds.has(e.id),
        }))}
      />
    </div>
  );
}

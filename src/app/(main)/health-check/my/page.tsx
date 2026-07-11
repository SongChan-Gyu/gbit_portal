import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import { HEALTH_CHECK_FORM_SLUG } from "@/lib/healthCheck";
import HealthCheckDeleteButton from "../HealthCheckDeleteButton";

export const metadata = { title: "내 신청 내역 | 건강검진 | GBIT Portal" };

export default async function HealthCheckMyPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as { employeeId?: string };
  if (!user.employeeId) redirect("/health-check");

  const healthForm = await prisma.form.findFirst({
    where: { slug: HEALTH_CHECK_FORM_SLUG, isActive: true },
    select: { id: true },
  });

  const submissions = healthForm
    ? await prisma.formSubmission.findMany({
        where: { employeeId: user.employeeId, formId: healthForm.id },
        include: {
          form: { select: { id: true, title: true, isActive: true } },
          answers: {
            include: { formField: { select: { label: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">건강검진 내 신청 내역</h1>
        <p className="page-subtitle">제출한 건강검진 신청 내역입니다. 수정·삭제가 필요하면 버튼을 이용해 주세요.</p>
      </div>

      {submissions.length === 0 ? (
        <div className="panel">
          <div className="panel-body text-sm text-gray-500 py-10 text-center space-y-3">
            <p>아직 제출한 신청 내역이 없습니다.</p>
            <Link href="/health-check" className="text-blue-600 hover:underline font-medium">
              건강검진 신청하기
            </Link>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">제출 내역</span>
            <span className="text-xs text-gray-400">{submissions.length}건</span>
          </div>
          <div className="divide-y divide-gray-100">
            {submissions.map((s) => {
              const nameAnswer = s.answers.find((a) => a.formField.label.includes("성명"));
              const amountAnswer = s.answers.find((a) => a.formField.label.includes("검진 지원금액"));
              const subtitle = [nameAnswer?.value, amountAnswer?.value].filter(Boolean).join(" · ");
              return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 px-4 py-3 md:py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] md:text-[13px] font-medium text-gray-800 truncate">
                    {subtitle || s.form.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    제출일 {s.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                    {!s.form.isActive && " · 마감된 양식"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/health-check/my/${s.id}/edit`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50"
                  >
                    수정
                  </Link>
                  <HealthCheckDeleteButton submissionId={s.id} />
                </div>
              </div>
            );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

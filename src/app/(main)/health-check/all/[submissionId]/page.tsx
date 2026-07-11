import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import { canViewAllHealthCheckSubmissions, healthCheckFormWhere } from "@/lib/healthCheck";

export const metadata = { title: "신청 상세 | 건강검진 | GBIT Portal" };

export default async function HealthCheckAllDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as { employeeId?: string; role?: string };
  const employee = user.employeeId
    ? await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: { dutyDept: true, name: true, empNo: true, team: { select: { name: true } } },
      })
    : null;

  if (!canViewAllHealthCheckSubmissions(employee, user.role)) {
    redirect("/health-check");
  }

  const { submissionId } = await params;

  const form = await prisma.form.findFirst({
    where: healthCheckFormWhere(false),
    select: { id: true, title: true },
  });
  if (!form) notFound();

  const submission = await prisma.formSubmission.findFirst({
    where: { id: submissionId, formId: form.id },
    include: {
      answers: { include: { formField: true } },
    },
  });
  if (!submission) notFound();

  const applicant = submission.employeeId
    ? await prisma.employee.findUnique({
        where: { id: submission.employeeId },
        select: { name: true, empNo: true, team: { select: { name: true } } },
      })
    : null;

  const byFieldId: Record<string, string> = {};
  submission.answers.forEach((a) => {
    byFieldId[a.formFieldId] = a.value;
  });

  const fields = await prisma.formField.findMany({
    where: { formId: form.id },
    orderBy: { sortOrder: "asc" },
  });

  const hasAnswers = submission.answers.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/health-check/all" className="text-sm text-gray-500 hover:text-gray-700">
        ← 전체 신청 내역
      </Link>

      <div>
        <h1 className="page-title">건강검진 신청 상세</h1>
        <p className="page-subtitle">{form.title}</p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">신청 정보</span>
        </div>
        <div className="panel-body space-y-3 text-sm">
          <div className="flex gap-2">
            <span className="text-gray-500 w-24 shrink-0">제출일시</span>
            <span className="text-gray-800">
              {submission.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500 w-24 shrink-0">신청 직원</span>
            <span className="text-gray-800">
              {applicant
                ? [applicant.name, applicant.empNo, applicant.team?.name].filter(Boolean).join(" · ")
                : submission.submitterName || "-"}
            </span>
          </div>
        </div>
      </div>

      {!hasAnswers ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          저장된 답변이 없습니다. 양식 변경 과정에서 데이터가 삭제되었을 수 있습니다. 해당 직원에게
          재신청을 요청해 주세요.
        </div>
      ) : (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">입력 내용</span>
          </div>
          <dl className="divide-y divide-gray-100">
            {fields.map((f) => (
              <div key={f.id} className="px-4 py-3 flex flex-col sm:flex-row sm:gap-4">
                <dt className="text-sm text-gray-500 sm:w-48 shrink-0">{f.label}</dt>
                <dd className="text-sm text-gray-900 mt-0.5 sm:mt-0 whitespace-pre-wrap break-words">
                  {byFieldId[f.id]?.trim() || "-"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

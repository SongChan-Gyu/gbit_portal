import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import SubmissionsTable from "@/app/(main)/admin/forms/[id]/submissions/SubmissionsTable";
import HealthCheckExportButton from "@/app/(main)/health-check/HealthCheckExportButton";
import { canViewAllHealthCheckSubmissions, healthCheckFormWhere } from "@/lib/healthCheck";

export const metadata = { title: "전체 신청 내역 | 건강검진 | GBIT Portal" };

export default async function HealthCheckAllPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as { employeeId?: string; role?: string };
  const employee = user.employeeId
    ? await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: { dutyDept: true },
      })
    : null;

  if (!canViewAllHealthCheckSubmissions(employee, user.role)) {
    redirect("/health-check");
  }

  const form = await prisma.form.findFirst({
    where: healthCheckFormWhere(false),
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });

  if (!form) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="page-title">건강검진 전체 신청 내역</h1>
        <div className="panel">
          <div className="panel-body text-sm text-gray-500 py-10 text-center">
            활성화된 건강검진 양식이 없습니다.
          </div>
        </div>
      </div>
    );
  }

  const submissions = await prisma.formSubmission.findMany({
    where: { formId: form.id },
    orderBy: { createdAt: "desc" },
    include: {
      answers: { include: { formField: true } },
    },
  });

  const employeeIds = [
    ...new Set(submissions.map((s) => s.employeeId).filter((id): id is string => !!id)),
  ];
  const employees = employeeIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: employeeIds } },
        select: {
          id: true,
          name: true,
          empNo: true,
          team: { select: { name: true } },
        },
      })
    : [];
  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  const rows = submissions.map((s) => {
    const byLabel: Record<string, string> = {};
    s.answers.forEach((a) => {
      if (a.formField?.label) byLabel[a.formField.label] = a.value;
    });
    const emp = s.employeeId ? employeeMap.get(s.employeeId) : null;
    const applicantLabel = emp
      ? [emp.name, emp.empNo, emp.team?.name].filter(Boolean).join(" · ")
      : s.submitterName;
    return {
      id: s.id,
      submitterName: s.submitterName,
      submitterEmail: s.submitterEmail ?? "",
      submitterPhone: s.submitterPhone ?? "",
      createdAt: s.createdAt.toISOString(),
      applicantEmployee: applicantLabel,
      labelValues: form.fields.reduce((acc, f) => {
        acc[f.label] = byLabel[f.label] ?? "";
        return acc;
      }, {} as Record<string, string>),
    };
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <Link href="/health-check" className="text-sm text-gray-500 hover:text-gray-700">
            ← 건강검진 신청
          </Link>
          <h1 className="page-title mt-2">건강검진 전체 신청 내역</h1>
          <p className="page-subtitle">회사 전체 건강검진 신청 내역입니다. (복지부·관리자)</p>
          <p className="text-sm text-gray-500 mt-1">
            총 {rows.length}건 · 행을 <span className="font-medium">더블클릭</span>하면 상세 내용을 볼 수 있습니다.
          </p>
        </div>
        <HealthCheckExportButton className="btn-primary text-sm py-2.5 px-4 rounded-lg font-medium inline-flex shrink-0 justify-center disabled:opacity-60" />
      </div>

      <SubmissionsTable
        formTitle={form.title}
        fields={form.fields.map((f) => f.label)}
        rows={rows}
        showApplicantEmployee
        omitSubmitterInfo
        showDelete
        rowHrefPrefix="/health-check/all"
      />
    </div>
  );
}

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formVisibleToUserOrClause } from "@/lib/formAccess";
import {
  canViewAllHealthCheckSubmissions,
  checkHealthCheckEligibility,
  HEALTH_CHECK_FORM_SLUG,
  healthCheckFormWhere,
} from "@/lib/healthCheck";

export const metadata = { title: "건강검진 신청 | GBIT Portal" };

export default async function HealthCheckPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as { employeeId?: string; role?: string };
  const employee = user.employeeId
    ? await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: { employeeType: true, dutyDept: true, birthDate: true, name: true },
      })
    : null;
  const isExternal = employee?.employeeType === "EXTERNAL";
  const canViewAll = canViewAllHealthCheckSubmissions(employee, user.role);
  const healthCheckEligibility = checkHealthCheckEligibility(employee, { slug: HEALTH_CHECK_FORM_SLUG });
  const healthCheckBlockReason = healthCheckEligibility.ok ? null : healthCheckEligibility.reason;

  let allSubmissionCount = 0;
  if (canViewAll) {
    const hcForm = await prisma.form.findFirst({
      where: healthCheckFormWhere(false),
      select: { id: true },
    });
    if (hcForm) {
      allSubmissionCount = await prisma.formSubmission.count({ where: { formId: hcForm.id } });
    }
  }

  const forms = await prisma.form.findMany({
    where: {
      isActive: true,
      showInMenu: true,
      ...formVisibleToUserOrClause(user.employeeId ?? "", !!isExternal),
    },
    select: { id: true, title: true, slug: true, description: true, isAnonymous: true },
    orderBy: { createdAt: "asc" },
  });

  const submittedFormIds = new Set(
    user.employeeId
      ? (
          await prisma.formSubmission.findMany({
            where: {
              employeeId: user.employeeId,
              formId: { in: forms.map((f) => f.id) },
            },
            select: { formId: true },
            distinct: ["formId"],
          })
        ).map((s) => s.formId)
      : [],
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">건강검진 신청</h1>
        <p className="page-subtitle">건강검진 등 사내 양식을 선택해 신청할 수 있습니다.</p>
      </div>

      {canViewAll && (
        <Link
          href="/health-check/all"
          className="block panel border-emerald-200 bg-emerald-50/80 hover:bg-emerald-50 transition-colors"
        >
          <div className="panel-body flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-sm font-semibold text-emerald-900">전체 신청 내역 (복지부)</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                회사 전체 건강검진 신청 {allSubmissionCount}건을 조회·엑셀 다운로드할 수 있습니다.
              </p>
            </div>
            <ChevronRight size={20} className="text-emerald-600 shrink-0" />
          </div>
        </Link>
      )}

      {healthCheckBlockReason && (
        <div className="panel border-amber-200 bg-amber-50/80">
          <div className="panel-body text-sm text-amber-900">
            {healthCheckBlockReason}
          </div>
        </div>
      )}

      {forms.length === 0 ? (
        <div className="panel">
          <div className="panel-body text-sm text-gray-500 py-10 text-center">
            현재 신청 가능한 건강검진 양식이 없습니다.
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">신청 양식</span>
          </div>
          <div className="divide-y divide-gray-100">
            {forms.map((f) => {
              const isHealthCheckForm = f.slug === HEALTH_CHECK_FORM_SLUG;
              const internalHealthCheck = isHealthCheckForm && employee?.employeeType !== "EXTERNAL";
              const done = submittedFormIds.has(f.id) && !internalHealthCheck;
              const href = `/forms/${f.id}`;
              const blocked = isHealthCheckForm && !!healthCheckBlockReason;
              const rowClass =
                "flex items-center justify-between px-4 py-3 md:py-2.5 transition-colors touch-manipulation";
              const rowContent = (
                <>
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[15px] md:text-[13px] font-medium ${done || blocked ? "text-gray-500" : "text-gray-800"}`}>
                          {f.title}
                        </span>
                        {f.isAnonymous && (
                          <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                            익명
                          </span>
                        )}
                      </div>
                      {f.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{f.description}</p>
                      )}
                    </div>
                    {done && (
                      <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        제출완료
                      </span>
                    )}
                    {blocked && (
                      <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        신청불가
                      </span>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-gray-400 shrink-0 md:w-3.5 md:h-3.5" />
                </>
              );
              if (blocked) {
                return (
                  <div
                    key={f.id}
                    className={`${rowClass} cursor-not-allowed bg-slate-50`}
                    title={healthCheckBlockReason ?? undefined}
                  >
                    {rowContent}
                  </div>
                );
              }
              return (
                <Link
                  key={f.id}
                  href={href}
                  className={`${rowClass} hover:bg-slate-50`}
                >
                  {rowContent}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

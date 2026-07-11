import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { todayKstYmd } from "@/lib/dateUtils";
import {
  buildHealthCheckExportSheetRows,
  findHealthCheckSupportAmountLabel,
  type HealthCheckExportRowInput,
} from "@/lib/healthCheckExport";
import { canViewAllHealthCheckSubmissions, healthCheckFormWhere } from "@/lib/healthCheck";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function answerByLabelIncludes(byLabel: Record<string, string>, ...parts: string[]): string {
  const key = Object.keys(byLabel).find((k) => parts.every((p) => k.includes(p)));
  return key ? byLabel[key] ?? "" : "";
}

/** 복지부·관리자: 건강검진 전체 신청 엑셀 다운로드 (검진대상자 명단 양식) */
export async function GET() {
  const session = await auth();
  const user = session?.user as { employeeId?: string; role?: string } | undefined;
  if (!user?.employeeId) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true },
  });
  if (!canViewAllHealthCheckSubmissions(employee, user.role)) {
    return Response.json({ error: "조회 권한이 없습니다." }, { status: 403 });
  }

  const form = await prisma.form.findFirst({
    where: healthCheckFormWhere(false),
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form) {
    return Response.json({ error: "건강검진 양식을 찾을 수 없습니다." }, { status: 404 });
  }

  const submissions = await prisma.formSubmission.findMany({
    where: { formId: form.id },
    orderBy: { createdAt: "asc" },
    include: {
      answers: { include: { formField: true } },
    },
  });

  const exportRows: HealthCheckExportRowInput[] = submissions.map((s, i) => {
    const byLabel: Record<string, string> = {};
    s.answers.forEach((a) => {
      if (a.formField?.label) byLabel[a.formField.label] = a.value;
    });

    return {
      index: i + 1,
      name: answerByLabelIncludes(byLabel, "성명"),
      rrn7: answerByLabelIncludes(byLabel, "주민번호"),
      phone: answerByLabelIncludes(byLabel, "전화번호"),
      empNo: answerByLabelIncludes(byLabel, "사원번호"),
      relatedEmployeeName: answerByLabelIncludes(byLabel, "관계임직원"),
      relationship: answerByLabelIncludes(byLabel, "직원과의"),
      storedTotalLabel: findHealthCheckSupportAmountLabel(byLabel),
    };
  });

  const rows = buildHealthCheckExportSheetRows(exportRows);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "임직원명단");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const dateYmd = todayKstYmd();

  // HTTP 헤더는 ASCII만 허용 — 한글 파일명은 클라이언트에서 지정
  return new Response(new Uint8Array(arr), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="health_check_${dateYmd}.xlsx"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

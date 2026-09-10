import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { todayKstYmd } from "@/lib/dateUtils";
import { buildEmployeeExportSheetRows, type EmployeeExportInput } from "@/lib/employeeExcel";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** PM·ADMIN: 사원정보 엑셀 다운로드. `?brief=1` 간략, `?external=1` 외부개발자만 */
export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  const guard = requirePMOrAdmin(user);
  if (guard) return guard;

  const params = new URL(req.url).searchParams;
  const brief = params.get("brief") === "1";
  const externalOnly = params.get("external") === "1";

  const employees = await prisma.employee.findMany({
    include: { team: { select: { name: true } }, user: { select: { username: true } } },
    orderBy: [{ team: { sortOrder: "asc" } }, { name: "asc" }],
  });

  const exportRows: EmployeeExportInput[] = employees.map((e) => ({
    empNo: e.empNo,
    companyStaffNo: e.companyStaffNo,
    name: e.name,
    teamName: e.team?.name ?? null,
    position: e.position,
    dutyDept: e.dutyDept,
    hireDate: e.hireDate,
    birthDate: e.birthDate,
    phone: e.phone ?? "",
    email: e.email,
    employeeType: e.employeeType,
    role: e.role,
    status: e.status,
    username: e.user?.username ?? null,
  }));

  const rows = buildEmployeeExportSheetRows(exportRows, { brief, externalOnly });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "사원목록");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const dateYmd = todayKstYmd();
  const filenameParts = ["employee"];
  if (brief) filenameParts.push("brief");
  if (externalOnly) filenameParts.push("external");
  if (filenameParts.length === 1) filenameParts.push("info");
  const filename = `${filenameParts.join("_")}_${dateYmd}.xlsx`;

  return new Response(new Uint8Array(arr), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}

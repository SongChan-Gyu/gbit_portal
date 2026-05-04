import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isWelfareDept } from "@/lib/jeju";
import prisma from "@/lib/db";
import * as XLSX from "xlsx";

async function canManageJeju(user: { employeeId?: string; role?: string }) {
  if (user.role === "PM" || user.role === "ADMIN") return true;
  const emp = await prisma.employee.findUnique({ where: { id: user.employeeId }, select: { dutyDept: true } });
  return isWelfareDept(emp);
}

/** GET /api/jeju/admin/bulk-import-template — 엑셀 양식 다운로드 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (!(await canManageJeju(user))) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const headers = [
    "신청자명",
    "신청자사번(선택)",
    "입실일(YYYY-MM-DD)",
    "퇴실일(YYYY-MM-DD)",
    "투숙객명",
    "투숙객연락처",
    "입실인원",
    "입금자명",
    "메모(선택)",
  ];

  const examples = [
    ["홍길동", "EMP001", "2026-01-10", "2026-01-12", "홍길동", "010-1234-5678", 2, "홍길동", "이관처리"],
    ["최구영", "", "2026-02-05", "2026-02-07", "최구영", "010-9999-1111", 1, "최구영", ""],
    ["외부개발자이름", "", "2026-03-15", "2026-03-17", "외부개발자이름", "010-5555-6666", 2, "외부개발자이름", "외부개발자"],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);

  // 열 너비
  ws["!cols"] = [
    { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
    { wch: 12 }, { wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "제주숙소이관");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="jeju_bulk_import_template.xlsx"',
    },
  });
}

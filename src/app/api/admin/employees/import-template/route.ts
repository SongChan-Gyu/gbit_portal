import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import * as XLSX from "xlsx";
import { TEMPLATE_HEADERS } from "@/lib/employeeExcel";

export async function GET() {
  const session = await auth();
  const user = session?.user as any;
  if (!["PM", "ADMIN"].includes(user?.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const wb = XLSX.utils.book_new();
  const wsData: string[][] = [
    [...TEMPLATE_HEADERS],
    ["E001", "홍길동", "개발팀", "선임", "운영부", "2024-01-15", "1990-05-20", "010-1234-5678", "hong@example.com", "정규직", "팀원"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, "사원목록");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="사원_일괄등록_양식.xlsx"',
    },
  });
}

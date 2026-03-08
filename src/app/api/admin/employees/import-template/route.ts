import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import * as XLSX from "xlsx";
import { TEMPLATE_HEADERS } from "@/lib/employeeExcel";

export async function GET() {
  try {
    const session = await auth();
    const user = session?.user as any;
    if (!session?.user || !["PM", "ADMIN"].includes(user?.role ?? ""))
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });

    const wb = XLSX.utils.book_new();
    const wsData: string[][] = [
      [...TEMPLATE_HEADERS],
      ["E001", "홍길동", "개발팀", "선임", "운영부", "2024-01-15", "1990-05-20", "010-1234-5678", "hong@example.com", "정규직", "팀원"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "사원목록");

    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const body = new Uint8Array(arr);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="사원_일괄등록_양식.xlsx"',
      },
    });
  } catch (err) {
    console.error("[import-template]", err);
    return NextResponse.json({ error: "양식 생성 실패" }, { status: 500 });
  }
}

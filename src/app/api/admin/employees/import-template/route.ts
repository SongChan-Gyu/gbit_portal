import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import * as XLSX from "xlsx";
import { TEMPLATE_HEADERS } from "@/lib/employeeExcel";

export async function GET() {
  try {
    const session = await auth();
    const user = session?.user as any;
    const guard = requirePMOrAdmin(user); if (guard) return guard;

    const wb = XLSX.utils.book_new();
    const wsData: string[][] = [
      [...TEMPLATE_HEADERS],
      ["홍길동", "개발팀", "사원", "운영부", "2024-01-15", "1990-05-20", "010-1234-5678", "hong@example.com", "정규직", "팀원"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "사원목록");

    const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const body = new Uint8Array(arr);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=\"employee_import_template.xlsx\"; filename*=UTF-8''%EC%82%AC%EC%9B%90_%EC%9D%BC%EA%B4%84%EB%93%B1%EB%A1%9D_%EC%96%91%EC%8B%9D.xlsx",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[import-template]", err);
    return NextResponse.json({ error: "양식 생성 실패" }, { status: 500 });
  }
}

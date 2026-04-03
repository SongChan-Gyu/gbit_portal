import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePMOrAdmin } from "@/lib/authGuard";
import * as XLSX from "xlsx";
import { parseSheetToRows } from "@/lib/employeeExcel";

export async function POST(req: Request) {
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  let file: File;
  try {
    const formData = await req.formData();
    file = formData.get("file") as File;
    if (!file?.size) return NextResponse.json({ error: "파일을 선택해 주세요." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "파일을 선택해 주세요." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  if (!firstSheet) return NextResponse.json({ error: "시트가 없습니다." }, { status: 400 });

  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "" }) as unknown[][];
  const { rows: parsed, errors } = parseSheetToRows(rows);

  return NextResponse.json({
    rows: parsed,
    errors,
    message: parsed.length
      ? `${parsed.length}건 인식됨. 확인 후 '일괄 등록'을 누르세요.`
      : "등록할 행이 없습니다. 양식을 확인해 주세요.",
  });
}

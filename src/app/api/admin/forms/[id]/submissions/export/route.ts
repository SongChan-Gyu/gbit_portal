import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin, requireSettingsAccess } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { todayKstYmd } from "@/lib/dateUtils";
import * as XLSX from "xlsx";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const u = session?.user as any;
  const guard = requireSettingsAccess(u); if (guard) return guard;
  const formId = (await ctx.params).id;
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form) return NextResponse.json({ error: "폼을 찾을 수 없습니다." }, { status: 404 });

  const submissions = await prisma.formSubmission.findMany({
    where: { formId },
    orderBy: { createdAt: "asc" },
    include: { answers: { include: { formField: true } } },
  });

  const headers = ["제출일시", "이름", "이메일", "연락처", ...form.fields.map((f) => f.label)];
  const rows: (string | number)[][] = [headers];
  for (const s of submissions) {
    const byField: Record<string, string> = {};
    s.answers.forEach((a) => {
      byField[a.formField.id] = a.value;
    });
    const dateStr = s.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    rows.push([
      dateStr,
      form.isAnonymous ? "익명" : s.submitterName ?? "",
      form.isAnonymous ? "" : s.submitterEmail ?? "",
      form.isAnonymous ? "" : s.submitterPhone ?? "",
      ...form.fields.map((f) => byField[f.id] ?? ""),
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  const sheetName = form.title.slice(0, 31).replace(/[/\\*?:\[\]]/g, " ");
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const filename = `form_${form.slug}_${todayKstYmd()}.xlsx`;

  return new NextResponse(new Uint8Array(arr), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

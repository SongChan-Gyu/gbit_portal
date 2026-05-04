import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { isWelfareDept, calcNights, jejuKstMidnightFromYmdStr } from "@/lib/jeju";
import { writeAudit, getIp } from "@/lib/audit";
import * as XLSX from "xlsx";

async function canManageJeju(user: { employeeId?: string; role?: string }) {
  if (user.role === "PM" || user.role === "ADMIN") return true;
  const emp = await prisma.employee.findUnique({ where: { id: user.employeeId }, select: { dutyDept: true } });
  return isWelfareDept(emp);
}

export type BulkPreviewRow = {
  rowNum: number;
  applicantName: string;
  applicantEmpNo: string;
  startDate: string;
  endDate: string;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  depositorName: string;
  note: string;
  // 매핑 결과
  matchedEmployeeId: string | null;
  matchedEmpNo: string | null;
  matchedTeam: string | null;
  matchedType: string | null; // INTERNAL | EXTERNAL
  matchCandidates: { id: string; name: string; empNo: string; teamName: string | null; employeeType: string }[];
  error: string | null;
};

/** POST /api/jeju/admin/bulk-import?action=preview — 엑셀 파싱 + 사원 매핑 미리보기 */
/** POST /api/jeju/admin/bulk-import?action=confirm — 확정 저장 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (!(await canManageJeju(user))) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "preview";

  // ── CONFIRM: JSON 배열로 확정된 rows 받아서 저장 ─────────────────────────────
  if (action === "confirm") {
    const body = await req.json().catch(() => ({}));
    const rows: ConfirmRow[] = body.rows ?? [];
    if (!rows.length) return NextResponse.json({ error: "저장할 행이 없습니다." }, { status: 400 });

    const actorId = user.employeeId as string;
    const now = new Date();
    const results: { rowNum: number; id?: string; error?: string }[] = [];

    for (const row of rows) {
      try {
        const sY = row.startDate.slice(0, 10);
        const eY = row.endDate.slice(0, 10);
        if (sY >= eY) { results.push({ rowNum: row.rowNum, error: "퇴실일이 입실일보다 빠릅니다." }); continue; }
        const startDate = jejuKstMidnightFromYmdStr(sY);
        const endDate = jejuKstMidnightFromYmdStr(eY);
        const nights = calcNights(startDate, endDate);

        const created = await prisma.$transaction(async (tx) => {
          const overlap = await tx.jejuAccommodation.findFirst({
            where: {
              status: { in: ["PENDING", "STEP1_APPROVED", "APPROVED"] },
              startDate: { lt: endDate },
              endDate: { gt: startDate },
            },
            select: { id: true, employee: { select: { name: true } }, startDate: true, endDate: true },
          });
          if (overlap) {
            const os = overlap.startDate.toISOString().slice(0, 10);
            const oe = overlap.endDate.toISOString().slice(0, 10);
            throw Object.assign(new Error("OVERLAP"), {
              detail: `${overlap.employee.name}님 예약(${os}~${oe})과 겹칩니다.`,
            });
          }
          return tx.jejuAccommodation.create({
            data: {
              employeeId: row.employeeId,
              startDate, endDate, nights,
              guestName: row.guestName,
              guestPhone: row.guestPhone,
              guestCount: row.guestCount,
              depositorName: row.depositorName,
              reason: row.note || "이관 처리",
              status: "APPROVED",
              step1ApproverId: actorId, step1ApprovedAt: now,
              approvedById: actorId, approvedAt: now,
              depositStatus: "CONFIRMED",
              depositConfirmedById: actorId, depositConfirmedAt: now,
            },
          });
        });

        await writeAudit({
          entityType: "JejuAccommodation", entityId: created.id, action: "CREATED", actorId,
          after: { employeeId: row.employeeId, startDate: sY, endDate: eY, nights, status: "APPROVED", note: row.note || "이관 처리" },
          ip: getIp(req) ?? undefined,
        });
        results.push({ rowNum: row.rowNum, id: created.id });
      } catch (e: unknown) {
        const err = e as Error & { detail?: string };
        results.push({ rowNum: row.rowNum, error: err.detail ?? err.message ?? "저장 실패" });
      }
    }

    const saved = results.filter((r) => r.id).length;
    const failed = results.filter((r) => r.error).length;
    return NextResponse.json({ ok: true, saved, failed, results });
  }

  // ── PREVIEW: multipart/form-data 엑셀 파싱 ───────────────────────────────────
  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "파일을 전송해 주세요." }, { status: 400 });
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];

  if (rawRows.length < 2) return NextResponse.json({ error: "데이터 행이 없습니다." }, { status: 400 });

  // 헤더 행 제외
  const dataRows = rawRows.slice(1);

  // 전체 사원 목록 (이름 매핑용)
  const allEmps = await prisma.employee.findMany({
    where: { status: { not: "INACTIVE" } },
    select: { id: true, name: true, empNo: true, employeeType: true, team: { select: { name: true } } },
  });
  const empByNo = new Map(allEmps.map((e) => [e.empNo.trim(), e]));
  const empByName = new Map<string, typeof allEmps>();
  for (const e of allEmps) {
    const key = e.name.trim();
    if (!empByName.has(key)) empByName.set(key, []);
    empByName.get(key)!.push(e);
  }

  const preview: BulkPreviewRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const applicantName = String(r[0] ?? "").trim();
    if (!applicantName) continue; // 빈 행 스킵

    const applicantEmpNo = String(r[1] ?? "").trim();
    const startDate = normalizeDate(r[2]);
    const endDate = normalizeDate(r[3]);
    const guestName = String(r[4] ?? "").trim();
    const guestPhone = String(r[5] ?? "").trim();
    const guestCount = parseInt(String(r[6] ?? "1"), 10) || 1;
    const depositorName = String(r[7] ?? "").trim() || guestName;
    const note = String(r[8] ?? "").trim();

    let matchedEmployeeId: string | null = null;
    let matchedEmpNo: string | null = null;
    let matchedTeam: string | null = null;
    let matchedType: string | null = null;
    let matchCandidates: BulkPreviewRow["matchCandidates"] = [];
    let error: string | null = null;

    if (!startDate || !endDate) {
      error = "날짜 형식 오류 (YYYY-MM-DD)";
    } else if (startDate >= endDate) {
      error = "퇴실일이 입실일보다 빠름";
    }

    // 사번 우선 매핑
    if (applicantEmpNo) {
      const found = empByNo.get(applicantEmpNo);
      if (found) {
        matchedEmployeeId = found.id;
        matchedEmpNo = found.empNo;
        matchedTeam = found.team?.name ?? null;
        matchedType = found.employeeType;
      } else {
        error = (error ? error + " / " : "") + `사번 '${applicantEmpNo}' 없음`;
      }
    } else {
      // 이름으로 매핑
      const candidates = empByName.get(applicantName) ?? [];
      matchCandidates = candidates.map((c) => ({
        id: c.id, name: c.name, empNo: c.empNo, teamName: c.team?.name ?? null, employeeType: c.employeeType,
      }));
      if (candidates.length === 1) {
        matchedEmployeeId = candidates[0].id;
        matchedEmpNo = candidates[0].empNo;
        matchedTeam = candidates[0].team?.name ?? null;
        matchedType = candidates[0].employeeType;
      } else if (candidates.length === 0) {
        error = (error ? error + " / " : "") + `'${applicantName}' 사원 없음 — 직접 선택 필요`;
      } else {
        error = (error ? error + " / " : "") + `'${applicantName}' 동명이인 ${candidates.length}명 — 직접 선택 필요`;
      }
    }

    preview.push({
      rowNum: i + 2, // 엑셀 행번호 (헤더=1)
      applicantName, applicantEmpNo,
      startDate: startDate ?? "", endDate: endDate ?? "",
      guestName, guestPhone, guestCount, depositorName, note,
      matchedEmployeeId, matchedEmpNo, matchedTeam, matchedType,
      matchCandidates, error,
    });
  }

  return NextResponse.json({ rows: preview });
}

type ConfirmRow = {
  rowNum: number;
  employeeId: string;
  startDate: string;
  endDate: string;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  depositorName: string;
  note: string;
};

function normalizeDate(val: unknown): string | null {
  if (!val && val !== 0) return null;
  // Date object (cellDates:true)
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, "-");
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  // Excel serial number
  const n = Number(s);
  if (!isNaN(n) && n > 40000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return null;
}

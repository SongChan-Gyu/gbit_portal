import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireSettingsAccess } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { sendFormReminderAlimtalk } from "@/lib/kakao";
import { writeAudit, getIp } from "@/lib/audit";
import { employeesForFormAlimtalk } from "@/lib/formAccess";

/**
 * POST /api/admin/forms/[id]/send-alimtalk
 * Body: { employeeIds: string[] }
 * 대상 직원에게 양식 제출 요청 알림톡(FORM_REMINDER) 발송.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: formId } = await params;
  const session = await auth();
  const user = session?.user as any;
  const guard = requireSettingsAccess(user);
  if (guard) return guard;

  const body = await req.json() as { employeeIds?: string[] };
  const employeeIds: string[] = Array.isArray(body.employeeIds) ? body.employeeIds : [];
  if (!employeeIds.length) {
    return NextResponse.json({ error: "발송 대상을 선택해 주세요." }, { status: 400 });
  }

  const form = await prisma.form.findUnique({ where: { id: formId } });
  if (!form) return NextResponse.json({ error: "양식을 찾을 수 없습니다." }, { status: 404 });

  const allowedList = await employeesForFormAlimtalk(prisma, {
    audience: form.audience ?? "ALL",
    targetGroupId: form.targetGroupId,
  });
  const allowedIds = new Set(allowedList.map((e) => e.id));
  const filteredIds = employeeIds.filter((id) => allowedIds.has(id));
  if (filteredIds.length !== employeeIds.length) {
    return NextResponse.json(
      { error: "이 양식의 발송 대상이 아닌 직원이 포함되어 있습니다. 목록에서만 선택해 주세요." },
      { status: 400 },
    );
  }

  const employees = await prisma.employee.findMany({
    where: { id: { in: filteredIds }, status: { in: ["ACTIVE", "INVITED"] } },
    select: { id: true, name: true, phone: true, alimtalkEnabled: true },
  });

  const origin =
    process.env.NEXTAUTH_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "https://www.gbitportal.co.kr";

  const formUrl = form.slug ? `${origin}/f/${form.slug}` : `${origin}/forms/${formId}`;

  const results: { name: string; status: string }[] = [];

  for (const emp of employees) {
    if (!emp.phone) {
      results.push({ name: emp.name, status: "SKIPPED_NO_PHONE" });
      continue;
    }
    try {
      await sendFormReminderAlimtalk(prisma, emp.id, emp.phone, emp.name, form.title, formUrl);
      results.push({ name: emp.name, status: "OK" });
    } catch {
      results.push({ name: emp.name, status: "ERROR" });
    }
  }

  await writeAudit({
    actorId: user.employeeId,
    action: "ALIMTALK_SENT",
    entityType: "Form",
    entityId: formId,
    note: `FORM_REMINDER 발송 ${employees.length}명: ${results.map((r) => r.name).join(", ")}`,
    ip: getIp(req) ?? undefined,
  });

  return NextResponse.json({ results, sent: employees.length });
}

/**
 * GET /api/admin/forms/[id]/send-alimtalk
 * 이 양식에 대해 발송된 알림톡 로그 조회 (FORM_REMINDER).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: formId } = await params;
  const session = await auth();
  const user = session?.user as any;
  const guard = requireSettingsAccess(user);
  if (guard) return guard;

  const form = await prisma.form.findUnique({ where: { id: formId }, select: { id: true } });
  if (!form) return NextResponse.json({ error: "양식을 찾을 수 없습니다." }, { status: 404 });

  // 직원 목록 및 마지막 발송일 조회
  const logs = await prisma.notificationLog.findMany({
    where: { templateCode: "FORM_REMINDER", targetId: { in: [] } },
  });
  void logs; // unused — returned per-employee below via dedicated query

  // 이 양식 발송 로그: targetId = employeeId, templateCode = FORM_REMINDER, params에 formId 포함
  const allLogs = await prisma.notificationLog.findMany({
    where: { templateCode: "FORM_REMINDER" },
    select: { targetId: true, sentAt: true, status: true, params: true },
    orderBy: { sentAt: "desc" },
  });

  // params JSON에 formId(or formUrl) 포함 여부로 이 양식 건 필터
  const formLogs = allLogs.filter((l) => {
    try {
      const p = JSON.parse(l.params ?? "{}") as Record<string, string>;
      return p["링크"]?.includes(formId) || p["링크경로"]?.includes(formId);
    } catch {
      return false;
    }
  });

  const lastSentByEmployee = new Map<string, string>();
  for (const l of formLogs) {
    if (!lastSentByEmployee.has(l.targetId) && l.sentAt) {
      lastSentByEmployee.set(l.targetId, new Date(l.sentAt).toISOString());
    }
  }

  return NextResponse.json({ lastSentByEmployee: Object.fromEntries(lastSentByEmployee) });
}

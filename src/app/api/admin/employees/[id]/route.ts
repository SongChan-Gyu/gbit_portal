import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { requirePMOrAdmin } from "@/lib/authGuard";
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { writeAudit, getIp } from "@/lib/audit";
import { emailEnabledSyncedToAddress } from "@/lib/employeeEmailPrefs";
import {
  normalizeCompanyStaffNo,
  syncUserUsernameFromCompanyStaffNo,
  INTERNAL_STAFF_FIXED_TEMP_PASSWORD,
  ensureInternalUserFromCompanyStaffNo,
} from "@/lib/employeeCompanyStaffNo";
import { EXTERNAL_DEFAULT_HIRE_YMD } from "@/lib/employeeExcel";

type EmployeePatchBody = {
  name: string;
  teamId?: string | null;
  position: string;
  dutyDept?: string | null;
  role: string;
  employeeType?: string;
  hireDate: string;
  birthDate?: string | null;
  phone?: string;
  email?: string | null;
  status: string;
  alimtalkEnabled?: boolean;
  isSettingsAdmin?: boolean;
  companyStaffNo?: string | null;
  /** 회사사번 변경 시에만 의미 있음. true면 고정 임시 비밀번호(9자, 사번과 무관)로 초기화 + 다음 로그인 시 변경 강제 */
  resetPasswordOnCompanyStaffNoChange?: boolean;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id:string }> }) {
  const { id } = await params;
  const session = await auth();
  const user = session?.user as any;
  const guard = requirePMOrAdmin(user); if (guard) return guard;

  const {
    name,
    teamId,
    position,
    dutyDept,
    role,
    employeeType,
    hireDate,
    birthDate,
    phone,
    email,
    status,
    alimtalkEnabled,
    isSettingsAdmin,
    companyStaffNo: companyStaffNoRaw,
    resetPasswordOnCompanyStaffNoChange: resetPwdRaw,
  } = (await req.json()) as EmployeePatchBody;

  const existing = await prisma.employee.findUnique({
    where: { id },
    include: { user: { select: { id: true } } },
  });
  if (!existing) return NextResponse.json({ error: "사원을 찾을 수 없습니다." }, { status: 404 });

  const nextEmail = email !== undefined ? (String(email ?? "").trim() || null) : existing.email;
  const companyStaffNo =
    companyStaffNoRaw !== undefined ? normalizeCompanyStaffNo(String(companyStaffNoRaw ?? "")) : undefined;

  const nextEmployeeType = employeeType ?? existing.employeeType;
  const hireIn = String(hireDate ?? "").trim();
  let hireResolved: Date;
  if (nextEmployeeType === "EXTERNAL" && !hireIn) {
    hireResolved = new Date(`${EXTERNAL_DEFAULT_HIRE_YMD}T00:00:00`);
  } else {
    if (!hireIn) {
      return NextResponse.json({ error: "입사일을 입력해 주세요." }, { status: 400 });
    }
    hireResolved = new Date(hireIn);
  }
  if (Number.isNaN(hireResolved.getTime())) {
    return NextResponse.json({ error: "입사일 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (companyStaffNo !== undefined) {
    if (companyStaffNo == null && existing.user && nextEmployeeType !== "EXTERNAL") {
      return NextResponse.json(
        { error: "계정이 있는 내부 직원은 회사사번(로그인 ID)을 비울 수 없습니다." },
        { status: 400 },
      );
    }
    if (companyStaffNo != null) {
      const dup = await prisma.employee.findFirst({
        where: { companyStaffNo, NOT: { id } },
        select: { id: true },
      });
      if (dup) return NextResponse.json({ error: "이미 사용 중인 회사사번입니다." }, { status: 400 });
    }
  }

  const before = { name: existing.name, status: existing.status };
  const oldStaffNorm = normalizeCompanyStaffNo(existing.companyStaffNo);
  const resetPwd = resetPwdRaw === true;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          name,
          teamId: teamId || null,
          position,
          dutyDept: dutyDept || null,
          role,
          employeeType: employeeType || "FULL",
          hireDate: hireResolved,
          birthDate: birthDate ? new Date(birthDate) : null,
          phone: phone || "",
          email: nextEmail,
          status,
          emailEnabled: emailEnabledSyncedToAddress(nextEmail),
          ...(alimtalkEnabled != null ? { alimtalkEnabled: !!alimtalkEnabled } : {}),
          // isSettingsAdmin은 ADMIN만 변경 가능
          ...(isSettingsAdmin != null && user.role === "ADMIN" ? { isSettingsAdmin: !!isSettingsAdmin } : {}),
          ...(companyStaffNo !== undefined ? { companyStaffNo } : {}),
        },
      });
      if (companyStaffNo !== undefined) {
        if (
          companyStaffNo != null &&
          !existing.user &&
          nextEmployeeType !== "EXTERNAL" &&
          status !== "INACTIVE"
        ) {
          await ensureInternalUserFromCompanyStaffNo(tx, id, companyStaffNo);
        } else if (existing.user) {
          await syncUserUsernameFromCompanyStaffNo(tx, id, companyStaffNo);
          const staffChanged =
            companyStaffNo != null && oldStaffNorm !== companyStaffNo;
          if (staffChanged && resetPwd) {
            const plain = INTERNAL_STAFF_FIXED_TEMP_PASSWORD;
            const hash = await bcrypt.hash(plain, 10);
            await tx.user.update({
              where: { employeeId: id },
              data: { passwordHash: hash, mustChangePassword: true },
            });
          }
        }
      }
    });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "회사사번 또는 로그인 ID가 다른 사원·계정과 중복입니다." },
        { status: 400 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("이미 다른 계정")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    throw e;
  }
  await writeAudit({
    entityType: "Employee",
    entityId: id,
    action: "UPDATED",
    actorId: user?.employeeId ?? null,
    before: before ?? undefined,
    after: { name, status },
    ip: getIp(req) ?? undefined,
  });
  return NextResponse.json({ ok:true });
}

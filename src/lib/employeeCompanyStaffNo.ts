import bcrypt from "bcryptjs";

export function normalizeCompanyStaffNo(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  return s.length ? s : null;
}

/**
 * 내부 사원 계정 자동 생성·회사사번 변경 시 비밀번호 초기화에 쓰는 고정값(9자, 회사사번과 무관).
 * 로그인 후 반드시 변경하도록 `mustChangePassword`와 함께 사용합니다.
 */
export const INTERNAL_STAFF_FIXED_TEMP_PASSWORD = "111aaa!!!";

/**
 * 인사에서 회사사번을 저장했을 때, 계정이 있으면 로그인 ID(`User.username`)를 같은 값으로 맞춤.
 * `companyStaffNo`가 null이면 User는 변경하지 않음(휴대폰 로그인 등 유지).
 * @param tx — `prisma.$transaction` 콜백 인자(확장 Prisma 클라이언트와 시그니처가 달라 `any` 사용)
 */
export async function syncUserUsernameFromCompanyStaffNo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  employeeId: string,
  companyStaffNo: string | null,
): Promise<void> {
  if (companyStaffNo == null) return;
  const user = await tx.user.findUnique({
    where: { employeeId },
    select: { id: true, username: true },
  });
  if (!user) return;
  if (user.username === companyStaffNo) return;
  const taken = await tx.user.findFirst({
    where: { username: companyStaffNo, employeeId: { not: employeeId } },
    select: { id: true },
  });
  if (taken) {
    throw new Error("이미 다른 계정에서 사용 중인 회사사번(로그인 ID)입니다.");
  }
  await tx.user.update({
    where: { id: user.id },
    data: { username: companyStaffNo },
  });
}

/**
 * 계정이 없고 회사사번만 있는 경우(엑셀·사원만 등록 등): `User`를 생성하고 재직 처리.
 * 외부개발자·퇴직(INACTIVE) 예외는 호출부에서 걸러야 함.
 * @returns 생성 여부
 */
export async function ensureInternalUserFromCompanyStaffNo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  employeeId: string,
  companyStaffNo: string,
): Promise<boolean> {
  const existingUser = await tx.user.findUnique({
    where: { employeeId },
    select: { id: true },
  });
  if (existingUser) return false;

  const taken = await tx.user.findFirst({
    where: { username: companyStaffNo, NOT: { employeeId } },
    select: { id: true },
  });
  if (taken) {
    throw new Error(`이미 다른 계정에서 사용 중인 회사사번(로그인 ID)입니다.(${companyStaffNo})`);
  }

  const plain = INTERNAL_STAFF_FIXED_TEMP_PASSWORD;
  const passwordHash = await bcrypt.hash(plain, 10);
  await tx.user.create({
    data: {
      employeeId,
      username: companyStaffNo,
      passwordHash,
      mustChangePassword: true,
    },
  });
  await tx.employee.update({
    where: { id: employeeId },
    data: { status: "ACTIVE" },
  });
  return true;
}

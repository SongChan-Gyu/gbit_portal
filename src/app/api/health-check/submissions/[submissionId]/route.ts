import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  canDeleteHealthCheckSubmission,
  HEALTH_CHECK_FORM_SLUG,
} from "@/lib/healthCheck";

/** DELETE: 건강검진 신청 건 삭제 (답변 포함 DB에서 제거) */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ submissionId: string }> },
) {
  const session = await auth();
  const user = session?.user as { employeeId?: string; role?: string } | undefined;
  if (!user?.employeeId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { submissionId } = await ctx.params;

  const submission = await prisma.formSubmission.findUnique({
    where: { id: submissionId },
    include: { form: { select: { slug: true } } },
  });

  if (!submission || submission.form.slug !== HEALTH_CHECK_FORM_SLUG) {
    return NextResponse.json({ error: "삭제할 신청 내역을 찾을 수 없습니다." }, { status: 404 });
  }

  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true },
  });

  if (
    !canDeleteHealthCheckSubmission(
      { employeeId: submission.employeeId },
      user.employeeId,
      employee,
      user.role,
    )
  ) {
    return NextResponse.json({ error: "삭제 권한이 없습니다." }, { status: 403 });
  }

  await prisma.formSubmission.delete({ where: { id: submissionId } });

  return NextResponse.json({ ok: true });
}

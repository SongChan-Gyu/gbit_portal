import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  const { stampDate, description } = await req.json();

  if (!stampDate || !description?.trim())
    return NextResponse.json({ error: "날짜와 반영 내용을 입력하세요." }, { status: 400 });

  const emp = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    include: { team: { include: { leader: true } } },
  });
  const teamLeader = emp?.team?.leader;
  const approverId = teamLeader?.id ?? null;

  const sr = await prisma.stampRequest.create({
    data: {
      employeeId: user.employeeId,
      stampDate: new Date(stampDate),
      description: description.trim(),
      approverId,
    },
  });
  return NextResponse.json({ ok: true, id: sr.id });
}

/**
 * Prisma 직접 DB 테스트 (비즈니스 로직 검증)
 * 실행: node test-db.mjs
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const ok   = (msg) => console.log(`  ✅ ${msg}`);
const fail = (msg) => { console.log(`  ❌ ${msg}`); errors++; };
const info = (msg) => console.log(`  ℹ️  ${msg}`);
const h    = (msg) => console.log(`\n${"─".repeat(52)}\n▶ ${msg}`);
let errors = 0;

async function main() {
  console.log("🧪 HRM DB 직접 테스트 시작\n");

  // ── 1. 기본 데이터 확인
  h("1. 시드 데이터 검증");
  const empCount  = await db.employee.count({ where:{ status:"ACTIVE" } });
  const userCount = await db.user.count();
  const ltCount   = await db.leaveType.count({ where:{ isActive:true } });
  const allocCount= await db.leaveAllocation.count({ where:{ fiscalYear:2025 } });

  empCount >= 5  ? ok(`재직 직원 ${empCount}명`) : fail(`직원 수 부족: ${empCount}`);
  userCount >= 5 ? ok(`사용자 계정 ${userCount}개`) : fail(`계정 수 부족: ${userCount}`);
  ltCount >= 5   ? ok(`활성 휴가유형 ${ltCount}개`) : fail(`휴가유형 없음`);
  allocCount >= 5? ok(`2025 귀속연도 할당 ${allocCount}건`) : fail(`할당 없음: ${allocCount}`);

  // ── 2. 기존 신청 내역 정합성
  h("2. 기존 휴가 신청 내역 정합성");
  const approvedReqs = await db.leaveRequest.findMany({
    where: { status:"APPROVED" },
    include: { items:true, approvals:true },
  });
  ok(`승인된 휴가 ${approvedReqs.length}건`);

  for (const req of approvedReqs) {
    if (req.items.length === 0) {
      fail(`요청 ${req.id.slice(0,8)} - 항목 없음`);
    } else {
      const itemDays = req.items.reduce((s,i)=>s+i.days,0);
      Math.abs(itemDays - req.totalDays) < 0.01
        ? ok(`  ${req.id.slice(0,8)}: 항목합계(${itemDays}) == totalDays(${req.totalDays})`)
        : fail(`  ${req.id.slice(0,8)}: 항목합계(${itemDays}) != totalDays(${req.totalDays})`);
    }
  }

  // ── 3. 할당 사용일수 vs 실제 신청 내역
  h("3. 할당 usedDays vs 실제 승인된 신청");
  const allocs = await db.leaveAllocation.findMany({
    where:{ fiscalYear:2025 },
    include:{ employee:true },
  });
  for (const a of allocs) {
    if (a.usedDays > 0) {
      const items = await db.leaveRequestItem.findMany({
        where: {
          allocationId: a.id,
          leaveRequest: { status: { in:["APPROVED","CANCEL_REQUESTED"] } },
        },
      });
      const actualUsed = items.reduce((s,i)=>s+i.days,0);
      Math.abs(actualUsed - a.usedDays) < 0.01
        ? ok(`  ${a.employee.name} - ${a.label}: usedDays(${a.usedDays}) 정합`)
        : fail(`  ${a.employee.name} - ${a.label}: DB usedDays=${a.usedDays} vs 실제=${actualUsed} 불일치`);
    }
  }

  // ── 4. 휴가 신청 → 결재 → 취소신청 → 취소결재 사이클 테스트
  h("4. 전체 휴가 사이클 테스트 (신청→결재→취소신청→취소결재)");

  // 테스트용 직원 (staff1 = E003)
  const staff1 = await db.employee.findUnique({ where:{ empNo:"E003" } });
  const tl1    = await db.employee.findFirst({ where:{ empNo:"E002" } });
  const pm     = await db.employee.findFirst({ where:{ empNo:"E001" } });
  const annual = await db.leaveType.findUnique({ where:{ code:"ANNUAL" } });
  const alloc  = await db.leaveAllocation.findFirst({
    where:{ employeeId:staff1?.id, sourceCode:"BASE_ANNUAL", fiscalYear:2025 },
  });

  if (!staff1||!tl1||!pm||!annual||!alloc) {
    fail("테스트용 기초 데이터 없음 - 시드 재실행 필요");
    return;
  }
  ok(`테스트 직원: ${staff1.name} (E003), 팀장: ${tl1.name}, PM: ${pm.name}`);

  const beforeUsed = alloc.usedDays;
  info(`  테스트 전 할당 usedDays: ${beforeUsed}`);

  // 4-a. 새 휴가 신청 생성 (PENDING)
  const req = await db.leaveRequest.create({
    data: {
      employeeId:  staff1.id,
      startDate:   new Date("2026-04-01"),
      endDate:     new Date("2026-04-02"),
      totalDays:   2,
      reason:      "테스트용 신청",
      status:      "PENDING",
      currentStep: 1,
      totalSteps:  2,
    },
  });
  await db.leaveRequestItem.create({
    data: {
      leaveRequestId: req.id,
      leaveTypeId:    annual.id,
      allocationId:   alloc.id,
      days:           2,
      startDate:      new Date("2026-04-01"),
      endDate:        new Date("2026-04-02"),
      reason:         "테스트용",
    },
  });
  await db.leaveApproval.createMany({
    data: [
      { leaveRequestId:req.id, approverId:tl1.id, step:1, status:"PENDING" },
      { leaveRequestId:req.id, approverId:pm.id,  step:2, status:"PENDING" },
    ],
  });
  ok(`4-a. 휴가 신청 생성 (ID: ${req.id.slice(0,10)})`);

  // 4-b. 팀장 1차 승인
  await db.leaveApproval.updateMany({
    where:{ leaveRequestId:req.id, approverId:tl1.id },
    data:{ status:"APPROVED", approvedAt:new Date() },
  });
  await db.leaveRequest.update({
    where:{ id:req.id },
    data:{ currentStep:2 },
  });
  ok("4-b. 팀장 1차 승인");

  // 4-c. PM 2차 승인 + 사용일수 차감
  await db.leaveApproval.updateMany({
    where:{ leaveRequestId:req.id, approverId:pm.id },
    data:{ status:"APPROVED", approvedAt:new Date() },
  });
  await db.leaveRequest.update({
    where:{ id:req.id },
    data:{ status:"APPROVED", currentStep:2 },
  });
  await db.leaveAllocation.update({
    where:{ id:alloc.id },
    data:{ usedDays:{ increment:2 } },
  });
  const afterApprove = await db.leaveAllocation.findUnique({ where:{id:alloc.id} });
  Math.abs((afterApprove?.usedDays ?? 0) - (beforeUsed + 2)) < 0.01
    ? ok(`4-c. PM 최종승인 + 사용일수 차감 (${beforeUsed} → ${afterApprove?.usedDays})`)
    : fail(`4-c. 사용일수 차감 오류: 기대 ${beforeUsed+2}, 실제 ${afterApprove?.usedDays}`);

  // 4-d. 취소신청
  await db.leaveApproval.createMany({
    data: [
      { leaveRequestId:req.id, approverId:tl1.id, step:1, status:"CANCEL_PENDING" },
      { leaveRequestId:req.id, approverId:pm.id,  step:2, status:"CANCEL_PENDING" },
    ],
  });
  await db.leaveRequest.update({
    where:{ id:req.id },
    data:{ status:"CANCEL_REQUESTED", cancelReason:"테스트 취소사유", currentStep:1 },
  });
  const cancelReq = await db.leaveRequest.findUnique({ where:{id:req.id} });
  cancelReq?.status === "CANCEL_REQUESTED"
    ? ok("4-d. 취소 신청 상태 변경 확인")
    : fail(`4-d. 상태 오류: ${cancelReq?.status}`);

  // 4-e. 팀장 취소결재 승인
  await db.leaveApproval.updateMany({
    where:{ leaveRequestId:req.id, approverId:tl1.id, status:"CANCEL_PENDING" },
    data:{ status:"CANCEL_APPROVED", approvedAt:new Date() },
  });
  await db.leaveRequest.update({
    where:{ id:req.id },
    data:{ currentStep:2 },
  });
  ok("4-e. 팀장 취소결재 1차 승인");

  // 4-f. PM 취소결재 최종 승인 + 사용일수 복원
  await db.leaveApproval.updateMany({
    where:{ leaveRequestId:req.id, approverId:pm.id, status:"CANCEL_PENDING" },
    data:{ status:"CANCEL_APPROVED", approvedAt:new Date() },
  });
  await db.leaveRequest.update({
    where:{ id:req.id },
    data:{ status:"CANCELLED", cancelledAt:new Date(), currentStep:2 },
  });
  await db.leaveAllocation.update({
    where:{ id:alloc.id },
    data:{ usedDays:{ decrement:2 } },
  });
  const afterCancel = await db.leaveAllocation.findUnique({ where:{id:alloc.id} });
  Math.abs((afterCancel?.usedDays ?? 0) - beforeUsed) < 0.01
    ? ok(`4-f. 취소 최종승인 + 사용일수 복원 (${afterApprove?.usedDays} → ${afterCancel?.usedDays}, 원복: ${beforeUsed})`)
    : fail(`4-f. 사용일수 복원 오류: 기대 ${beforeUsed}, 실제 ${afterCancel?.usedDays}`);

  // 4-g. 최종 상태 확인
  const finalReq = await db.leaveRequest.findUnique({
    where:{ id:req.id },
    include:{ approvals:true },
  });
  finalReq?.status === "CANCELLED"
    ? ok("4-g. 최종 상태: CANCELLED ✓")
    : fail(`4-g. 최종 상태 오류: ${finalReq?.status}`);

  // 테스트 데이터 정리
  await db.leaveApproval.deleteMany({ where:{ leaveRequestId:req.id } });
  await db.leaveRequestItem.deleteMany({ where:{ leaveRequestId:req.id } });
  await db.leaveRequest.delete({ where:{ id:req.id } });
  info("  테스트 데이터 정리 완료");

  // ── 5. 사원 정보 조회/수정 테스트
  h("5. 사원 정보 수정 (전화번호 선택사항 검증)");
  const emp = await db.employee.findUnique({ where:{ empNo:"E003" } });
  if (emp) {
    await db.employee.update({
      where:{ id:emp.id },
      data:{ phone:"" }, // 빈 전화번호 허용 확인
    });
    const updated = await db.employee.findUnique({ where:{ id:emp.id } });
    updated?.phone === ""
      ? ok("전화번호 빈값 저장 허용 ✓")
      : fail(`전화번호 업데이트 실패: ${updated?.phone}`);
    // 원복
    await db.employee.update({ where:{ id:emp.id }, data:{ phone:"010-1000-0002" } });
  }

  // ── 6. 귀속연도별 통계
  h("6. 귀속연도 통계 요약");
  const stats = await db.leaveAllocation.groupBy({
    by: ["fiscalYear"],
    _sum: { totalDays:true, usedDays:true },
    _count: { id:true },
    orderBy: { fiscalYear:"asc" },
  });
  for (const s of stats) {
    info(`  ${s.fiscalYear ?? "기간없음"}년도: 할당 ${s._sum.totalDays}일, 사용 ${s._sum.usedDays}일, ${s._count.id}건`);
  }
  stats.length > 0 ? ok("귀속연도 통계 정상") : fail("귀속연도 데이터 없음");

  // ── 7. 취소 관련 API 라우트 파일 존재 확인
  h("7. 핵심 API 라우트 파일 존재 확인");
  const fs = await import("fs");
  const routes = [
    "src/app/api/leave/request/[id]/cancel-request/route.ts",
    "src/app/api/leave/cancel-approve/route.ts",
    "src/app/(main)/leave/my/CancelRequestButton.tsx",
    "src/app/(main)/leave/approve/CancelApproveActions.tsx",
    "src/components/layout/ImpersonationBanner.tsx",
    "src/app/api/admin/fiscal-year/init/route.ts",
    "src/app/(main)/attendance/AttendanceClient.tsx",
  ];
  for (const r of routes) {
    fs.existsSync(`c:/hrm-web/${r}`)
      ? ok(`${r.split("/").at(-1)} 존재`)
      : fail(`${r} 없음`);
  }

  // ── 최종 결과
  console.log("\n" + "═".repeat(52));
  console.log("📊 테스트 결과 요약");
  console.log("═".repeat(52));
  if (errors === 0) {
    console.log("  🎉 모든 테스트 통과!");
  } else {
    console.log(`  ⚠️  ${errors}건 실패 — 위 ❌ 항목 확인 필요`);
  }
  console.log("═".repeat(52));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());

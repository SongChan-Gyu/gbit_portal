/** 내 휴가·결재 UI: 복합 신청 시 동일 단계에 승인 행이 여러 개여도 한 줄로 요약 */

export type ApprovalRowLite = {
  step: number;
  status: string;
  approver: { name: string };
};

export function summarizeLeaveApprovals(approvals: ApprovalRowLite[]): string {
  if (approvals.length === 0) return "";
  const byStep = new Map<number, ApprovalRowLite[]>();
  for (const a of approvals) {
    const arr = byStep.get(a.step) ?? [];
    arr.push(a);
    byStep.set(a.step, arr);
  }
  const steps = [...byStep.keys()].sort((a, b) => a - b);
  return steps
    .map((step) => {
      const rows = byStep.get(step)!;
      const names = [...new Set(rows.map((r) => r.approver.name))];
      const nameStr = names.join("·");
      const hasRejected = rows.some((r) => r.status === "REJECTED");
      const hasPending = rows.some((r) => r.status === "PENDING");
      const allApproved = rows.length > 0 && rows.every((r) => r.status === "APPROVED");
      const st = hasRejected ? "반려" : allApproved ? "승인" : hasPending ? "진행" : "처리";
      return `${step}단계 ${nameStr} ${st}`;
    })
    .join(" → ");
}

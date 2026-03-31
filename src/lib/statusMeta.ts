export function leaveRequestStatusMeta(status: string): { label: string; badge: string } {
  const map: Record<string, { label: string; badge: string }> = {
    PENDING: { label: "대기", badge: "badge-warning" },
    APPROVED: { label: "승인", badge: "badge-success" },
    REJECTED: { label: "반려", badge: "badge-danger" },
    CANCEL_REQUESTED: { label: "취소신청", badge: "badge-warning" },
    CANCELLED: { label: "취소", badge: "badge-default" },
    WITHDRAWN: { label: "철회", badge: "badge-default" },
  };
  return map[status] ?? { label: status, badge: "badge-default" };
}

export function leaveApprovalStatusMeta(status: string): { label: string; badge: string } {
  const map: Record<string, { label: string; badge: string }> = {
    PENDING: { label: "대기", badge: "badge-warning" },
    APPROVED: { label: "승인", badge: "badge-success" },
    REJECTED: { label: "반려", badge: "badge-default" },
  };
  return map[status] ?? { label: status, badge: "badge-default" };
}

export function leaveCancelApprovalStatusMeta(status: string): { label: string; badge: string } {
  const map: Record<string, { label: string; badge: string }> = {
    CANCEL_PENDING: { label: "대기", badge: "badge-warning" },
    CANCEL_APPROVED: { label: "취소승인", badge: "badge-success" },
    CANCEL_REJECTED: { label: "취소반려", badge: "badge-default" },
  };
  return map[status] ?? { label: status, badge: "badge-default" };
}

export function employeeStatusMeta(status: string): { label: string; badge: string } {
  const map: Record<string, { label: string; badge: string }> = {
    PENDING: { label: "미초대", badge: "bg-gray-100 text-gray-500" },
    INVITED: { label: "초대발송", badge: "bg-yellow-100 text-yellow-700" },
    ACTIVE: { label: "재직", badge: "bg-green-100 text-green-700" },
    INACTIVE: { label: "퇴직", badge: "bg-red-100 text-red-500" },
  };
  return map[status] ?? { label: status, badge: "bg-gray-100 text-gray-500" };
}

export function leaveApproveEntryKindMeta(kind: "REQUEST" | "CANCEL"): { label: string; badge: string; rowClass: string } {
  if (kind === "CANCEL") {
    return {
      label: "취소",
      badge: "text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded",
      rowClass: "bg-amber-50/30",
    };
  }
  return {
    label: "신청",
    badge: "text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded",
    rowClass: "",
  };
}


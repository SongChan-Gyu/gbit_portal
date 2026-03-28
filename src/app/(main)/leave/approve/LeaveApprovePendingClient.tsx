"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMDWithDay, formatYMD } from "@/lib/dateUtils";
import ApproveActions from "./ApproveActions";
import CancelApproveActions from "./CancelApproveActions";

type SerializedReq = {
  id: string;
  employee: { name: string; team?: { name: string | null } | null };
  items: Array<{
    id: string;
    days: number;
    reason: string | null;
    leaveType: { name: string; color: string };
    startDate: string;
    endDate: string;
  }>;
  startDate: string;
  endDate: string;
  totalDays: number;
  totalSteps: number;
  createdAt: string;
  cancelReason: string | null;
  approvals: Array<{
    id: string;
    step: number;
    status: string;
    approver: { name: string };
  }>;
};

export type PendingApprovalRow = {
  id: string;
  step: number;
  status: string;
  leaveRequest: SerializedReq;
};

function summaryLine(req: SerializedReq): string {
  const items = req.items;
  if (items.length === 1) {
    const it = items[0];
    return `${formatMDWithDay(it.startDate)} · ${it.leaveType.name} ${it.days}일`;
  }
  const a = formatMDWithDay(req.startDate);
  const b = formatMDWithDay(req.endDate);
  const s0 = req.startDate.slice(0, 10);
  const e0 = req.endDate.slice(0, 10);
  if (s0 === e0) {
    return `${a} · 복합 ${req.totalDays}일`;
  }
  return `${a} ~ ${b} · ${req.totalDays}일`;
}

function detailTitle(req: SerializedReq): string {
  if (req.items.length === 1) {
    const it = req.items[0];
    return `${req.employee.name} · ${it.leaveType.name} ${it.days}일`;
  }
  return `${req.employee.name} · 복합 ${req.totalDays}일`;
}

export default function LeaveApprovePendingClient({
  actionable,
  cancelActionable,
}: {
  actionable: PendingApprovalRow[];
  cancelActionable: PendingApprovalRow[];
}) {
  const queue = useMemo(
    () => [
      ...actionable.map((a) => ({ row: a, kind: "leave" as const })),
      ...cancelActionable.map((a) => ({ row: a, kind: "cancel" as const })),
    ],
    [actionable, cancelActionable],
  );

  const [selectedId, setSelectedId] = useState<string | null>(() => queue[0]?.row.id ?? null);

  useEffect(() => {
    if (queue.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!queue.some((q) => q.row.id === selectedId)) {
      setSelectedId(queue[0].row.id);
    }
  }, [queue, selectedId]);

  const selected = useMemo(() => {
    const found = queue.find((q) => q.row.id === selectedId);
    return found ?? null;
  }, [queue, selectedId]);

  if (queue.length === 0) return null;

  return (
    <div className="md:grid md:grid-cols-5 md:gap-5 md:items-start">
      {/* 리스트: 보기만 (버튼 없음) */}
      <div className="md:col-span-2">
        <p className="text-xs font-semibold text-gray-500 mb-2">
          결재 대기 <span className="text-slate-700">{queue.length}</span>건
        </p>
        <ul className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100 shadow-sm md:max-h-[min(70vh,520px)] md:overflow-y-auto">
          {queue.map(({ row: ap, kind }) => {
            const req = ap.leaveRequest;
            const active = ap.id === selectedId;
            return (
              <li key={ap.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(ap.id)}
                  className={`w-full text-left py-2.5 px-3 transition-colors touch-manipulation min-h-[52px] ${
                    active
                      ? "bg-slate-50 ring-1 ring-inset ring-slate-200/80"
                      : "hover:bg-gray-50 active:bg-gray-100"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-gray-900 text-[15px] leading-tight block">
                        {req.employee.name}
                      </span>
                      <p className="text-[13px] text-gray-600 mt-0.5 leading-snug">
                        {summaryLine(req)}
                      </p>
                      {kind === "cancel" && (
                        <span className="inline-block mt-1 text-[10px] font-medium text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded">
                          취소 신청
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-500 shrink-0 tabular-nums pt-0.5">
                      [{ap.step}단계]
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-gray-400 md:hidden">
          목록은 확인용입니다. 선택하면 아래에서 승인·반려할 수 있습니다.
        </p>
      </div>

      {/* 상세: 의견 + 승인/반려 */}
      <div className="mt-4 md:mt-0 md:col-span-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:sticky md:top-4">
        {selected ? (
          <PendingDetail ap={selected.row} kind={selected.kind} />
        ) : (
          <p className="text-sm text-gray-400 text-center py-10">
            왼쪽 목록에서 건을 선택하면 상세에서 처리할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}

function PendingDetail({
  ap,
  kind,
}: {
  ap: PendingApprovalRow;
  kind: "leave" | "cancel";
}) {
  const req = ap.leaveRequest;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 leading-snug">{detailTitle(req)}</h2>
        <p className="text-sm text-gray-600 mt-1.5">
          {formatMDWithDay(req.startDate)}
          {req.startDate.slice(0, 10) !== req.endDate.slice(0, 10) &&
            ` ~ ${formatMDWithDay(req.endDate)}`}
        </p>
        {req.employee.team?.name && (
          <p className="text-xs text-gray-400 mt-0.5">{req.employee.team.name}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {req.items.map((it) => (
          <span
            key={it.id}
            className="text-sm px-2 py-0.5 rounded border font-medium"
            style={{
              color: it.leaveType.color,
              borderColor: `${it.leaveType.color}40`,
              background: `${it.leaveType.color}10`,
            }}
          >
            {it.leaveType.name} {it.days}일
            {it.reason?.trim() && it.reason.trim().length >= 2 ? ` — ${it.reason.trim()}` : ""}
          </span>
        ))}
      </div>

      {kind === "leave" ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500 text-xs">기간</span>
            <p className="font-medium text-[15px] mt-0.5">
              {formatMDWithDay(req.startDate)}
              {req.startDate.slice(0, 10) !== req.endDate.slice(0, 10) &&
                ` ~ ${formatMDWithDay(req.endDate)}`}
              <span className="ml-1 text-slate-800 font-bold">{req.totalDays}일</span>
            </p>
          </div>
          <div>
            <span className="text-gray-500 text-xs">신청일</span>
            <p className="font-medium text-[15px] mt-0.5">{formatYMD(req.createdAt)}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500 text-xs">원래 휴가 기간</span>
            <p className="font-medium text-[15px] mt-0.5">
              {formatMDWithDay(req.startDate)}
              {req.startDate.slice(0, 10) !== req.endDate.slice(0, 10) &&
                ` ~ ${formatMDWithDay(req.endDate)}`}
              <span className="ml-1 text-slate-800 font-bold">{req.totalDays}일</span>
            </p>
          </div>
          <div>
            <span className="text-gray-500 text-xs">취소 사유</span>
            <p className="font-medium text-[15px] mt-0.5 text-amber-900">{req.cancelReason ?? "—"}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {kind === "leave"
          ? req.approvals
              .filter(
                (a, i, arr) =>
                  arr.findIndex(
                    (x) => x.step === a.step && ["PENDING", "APPROVED", "REJECTED"].includes(x.status),
                  ) === i,
              )
              .map((a, i) => (
                <span key={a.id} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-gray-300">→</span>}
                  <span
                    className={`px-2 py-0.5 rounded border text-xs ${
                      a.status === "APPROVED"
                        ? "bg-slate-100 text-slate-700 border-slate-300"
                        : a.id === ap.id
                          ? "bg-slate-100 text-slate-800 border-slate-400"
                          : "bg-gray-50 text-gray-500 border-gray-200"
                    }`}
                  >
                    {a.approver.name}
                    {a.status === "APPROVED" ? " ✓" : ""}
                    {a.id === ap.id ? " ◉" : ""}
                  </span>
                </span>
              ))
          : req.approvals
              .filter((a) => ["CANCEL_PENDING", "CANCEL_APPROVED", "CANCEL_REJECTED"].includes(a.status))
              .map((a, i) => (
                <span key={a.id} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-gray-300">→</span>}
                  <span
                    className={`px-2 py-0.5 rounded border text-xs ${
                      a.status === "CANCEL_APPROVED"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : a.status === "CANCEL_REJECTED"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : a.id === ap.id
                            ? "bg-orange-50 text-orange-700 border-orange-300"
                            : "bg-gray-50 text-gray-500 border-gray-200"
                    }`}
                  >
                    {a.approver.name}
                    {a.status === "CANCEL_APPROVED" ? " ✓" : a.status === "CANCEL_REJECTED" ? " ✗" : ""}
                    {a.id === ap.id ? " ◉" : ""}
                  </span>
                </span>
              ))}
      </div>

      <div className="border-t border-gray-100 pt-4">
        {kind === "leave" ? <ApproveActions approvalId={ap.id} /> : <CancelApproveActions requestId={req.id} />}
      </div>
    </div>
  );
}

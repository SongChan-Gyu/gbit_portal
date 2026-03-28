"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { formatMDWithDay } from "@/lib/dateUtils";

interface SR {
  id: string;
  stampDate: string;
  description: string;
  status: string;
  employee: { name: string; team: { name: string } | null; position: string };
  comment: string | null;
}

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "대기", cls: "badge-warning" },
  APPROVED: { label: "승인", cls: "badge-success" },
  REJECTED: { label: "반려", cls: "badge-danger" },
};

function summaryLine(sr: SR): string {
  const desc = sr.description.trim();
  const one = desc.length > 36 ? `${desc.slice(0, 34)}…` : desc;
  return `${formatMDWithDay(sr.stampDate)} · ${one || "스탬프 요청"}`;
}

export default function StampApproveClient({ requests }: { requests: SR[] }) {
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const [comment, setComment] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => requests[0]?.id ?? null);

  const queue = useMemo(() => requests, [requests]);

  useEffect(() => {
    if (queue.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!queue.some((r) => r.id === selectedId)) {
      setSelectedId(queue[0].id);
    }
  }, [queue, selectedId]);

  useEffect(() => {
    setComment("");
  }, [selectedId]);

  const selected = useMemo(() => queue.find((r) => r.id === selectedId) ?? null, [queue, selectedId]);

  async function handle(id: string, action: "APPROVE" | "REJECT") {
    if (action === "REJECT" && !comment.trim()) {
      alert("반려 사유를 입력하세요.");
      return;
    }
    setProcessing(true);
    await fetch("/api/stamp/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, comment }),
    });
    setProcessing(false);
    setComment("");
    router.refresh();
  }

  if (requests.length === 0) {
    return (
      <div className="panel">
        <div className="panel-body text-center py-10 text-gray-400 text-sm">
          처리할 스탬프 요청이 없습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="md:grid md:grid-cols-5 md:gap-5 md:items-start">
      {/* 리스트: 보기만 (승인/반려 없음) */}
      <div className="md:col-span-2">
        <p className="text-xs font-semibold text-gray-500 mb-2">
          목록 <span className="text-slate-700">{queue.length}</span>건
        </p>
        <ul className="rounded-xl border border-gray-200 bg-white overflow-hidden divide-y divide-gray-100 shadow-sm md:max-h-[min(70vh,520px)] md:overflow-y-auto">
          {queue.map((sr) => {
            const si = STATUS_INFO[sr.status] ?? STATUS_INFO.PENDING;
            const active = sr.id === selectedId;
            return (
              <li key={sr.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(sr.id)}
                  className={`w-full text-left py-2.5 px-3 transition-colors touch-manipulation min-h-[52px] ${
                    active
                      ? "bg-slate-50 ring-1 ring-inset ring-slate-200/80"
                      : "hover:bg-gray-50 active:bg-gray-100"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-gray-900 text-[15px] leading-tight block">
                        {sr.employee.name}
                      </span>
                      <p className="text-[13px] text-gray-600 mt-0.5 leading-snug">{summaryLine(sr)}</p>
                    </div>
                    <span className={`shrink-0 text-[11px] ${si.cls} badge`}>{si.label}</span>
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
          <StampDetail
            sr={selected}
            comment={comment}
            onCommentChange={setComment}
            processing={processing}
            onApprove={() => handle(selected.id, "APPROVE")}
            onReject={() => handle(selected.id, "REJECT")}
          />
        ) : (
          <p className="text-sm text-gray-400 text-center py-10">
            왼쪽 목록에서 건을 선택하면 상세에서 처리할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}

function StampDetail({
  sr,
  comment,
  onCommentChange,
  processing,
  onApprove,
  onReject,
}: {
  sr: SR;
  comment: string;
  onCommentChange: (v: string) => void;
  processing: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isPending = sr.status === "PENDING";
  const si = STATUS_INFO[sr.status] ?? STATUS_INFO.PENDING;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 leading-snug">
          {sr.employee.name} · 스탬프
        </h2>
        <p className="text-sm text-gray-600 mt-1">{formatMDWithDay(sr.stampDate)}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {sr.employee.team?.name ?? "팀 없음"} · {sr.employee.position}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-500 mb-1">내용</p>
        <p className="text-[15px] text-gray-800 whitespace-pre-wrap">{sr.description}</p>
        {sr.comment?.trim() && (
          <p className="text-sm text-gray-500 mt-2">
            <span className="text-gray-400">신청자 메모:</span> {sr.comment}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">상태</span>
        <span className={`badge ${si.cls}`}>{si.label}</span>
      </div>

      {isPending ? (
        <div className="border-t border-gray-100 pt-4 space-y-2">
          <label className="block text-xs font-medium text-gray-600">의견 입력</label>
          <textarea
            className="input resize-none text-[13px]"
            rows={3}
            placeholder="반려 시 사유를 입력하세요."
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onApprove}
              disabled={processing}
              className="btn-primary flex-1 gap-1 py-2.5"
            >
              <CheckCircle2 size={16} />
              {processing ? "처리 중…" : "승인"}
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={processing}
              className="btn-danger flex-1 gap-1 py-2.5"
            >
              <XCircle size={16} />
              {processing ? "처리 중…" : "반려"}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400 border-t border-gray-100 pt-4">이미 처리된 건입니다.</p>
      )}
    </div>
  );
}

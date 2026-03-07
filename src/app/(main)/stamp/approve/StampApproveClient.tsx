"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { formatMDWithDay, formatYMD } from "@/lib/dateUtils";

interface SR {
  id: string; stampDate: string; description: string; status: string;
  employee: { name: string; team: { name: string } | null; position: string };
  comment: string | null;
}

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  PENDING:  { label: "대기",   cls: "badge-warning" },
  APPROVED: { label: "승인완료", cls: "badge-success" },
  REJECTED: { label: "반려",   cls: "badge-danger" },
};

export default function StampApproveClient({ requests }: { requests: SR[] }) {
  const router = useRouter();
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [comments, setComments]     = useState<Record<string, string>>({});
  const [expandedId, setExpandedId]  = useState<string | null>(null);

  async function handle(id: string, action: "APPROVE" | "REJECT") {
    if (action === "REJECT" && !comments[id]?.trim()) {
      alert("반려 사유를 입력하세요."); return;
    }
    setProcessing((p) => ({ ...p, [id]: true }));
    await fetch("/api/stamp/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, comment: comments[id] ?? "" }),
    });
    setProcessing((p) => ({ ...p, [id]: false }));
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
    <div className="panel">
      {/* 모바일: 카드 형태 — 요약만 보이고 탭 시 상세 + 처리 */}
      <div className="md:hidden space-y-2">
        {requests.map((sr) => {
          const isPending = sr.status === "PENDING";
          const si = STATUS_INFO[sr.status] ?? STATUS_INFO.PENDING;
          const open = expandedId === sr.id;
          return (
            <div key={sr.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => setExpandedId((id) => (id === sr.id ? null : sr.id))}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-2 touch-manipulation"
                aria-expanded={open}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-800 text-[15px]">{sr.employee.name}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {formatMDWithDay(sr.stampDate)}
                    <span className={`ml-2 badge ${si.cls}`}>{si.label}</span>
                  </p>
                </div>
                <span className="shrink-0 text-gray-400">
                  {open ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
                </span>
              </button>
              {open && (
                <div className="px-4 pb-4 pt-0 border-t border-gray-100 text-[15px]">
                  <p className="text-gray-700 font-medium mt-2">{sr.description}</p>
                  {sr.comment && <p className="text-sm text-gray-500 mt-1">{sr.comment}</p>}
                  {isPending ? (
                    <div className="space-y-2 mt-3">
                      <input
                        className="input text-[15px] py-2"
                        placeholder="의견 (반려 시 필수)"
                        value={comments[sr.id] ?? ""}
                        onChange={(e) => setComments((p) => ({ ...p, [sr.id]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handle(sr.id, "APPROVE")}
                          disabled={processing[sr.id]}
                          className="btn-primary flex-1 gap-1 py-2.5"
                        >
                          <CheckCircle2 size={16} /> 승인
                        </button>
                        <button
                          onClick={() => handle(sr.id, "REJECT")}
                          disabled={processing[sr.id]}
                          className="btn-danger flex-1 gap-1 py-2.5"
                        >
                          <XCircle size={16} /> 반려
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm mt-2">처리완료</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 데스크톱: 테이블 + 가로 스크롤 */}
      <div className="hidden md:block table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>신청자</th><th>반영 날짜</th><th>내용</th>
              <th>상태</th><th>처리</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((sr) => {
              const isPending = sr.status === "PENDING";
              const si = STATUS_INFO[sr.status] ?? STATUS_INFO.PENDING;
              return (
                <tr key={sr.id}>
                  <td>
                    <p className="font-medium text-gray-800">{sr.employee.name}</p>
                    <p className="text-xs text-gray-400">{sr.employee.team?.name} · {sr.employee.position}</p>
                  </td>
                  <td className="whitespace-nowrap">
                    {formatYMD(sr.stampDate)}
                  </td>
                  <td className="max-w-[200px]">
                    <p className="text-[13px] text-gray-700">{sr.description}</p>
                    {sr.comment && <p className="text-xs text-gray-400 mt-0.5">{sr.comment}</p>}
                  </td>
                  <td>
                    <span className={`badge ${si.cls}`}>{si.label}</span>
                  </td>
                  <td>
                    {isPending ? (
                      <div className="space-y-1.5 min-w-[180px]">
                        <input className="input text-xs py-1"
                          placeholder="의견 (반려 시 필수)"
                          value={comments[sr.id] ?? ""}
                          onChange={(e) => setComments((p) => ({ ...p, [sr.id]: e.target.value }))} />
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handle(sr.id, "APPROVE")}
                            disabled={processing[sr.id]}
                            className="btn-primary btn-sm flex-1 gap-1">
                            <CheckCircle2 size={12} /> 승인
                          </button>
                          <button
                            onClick={() => handle(sr.id, "REJECT")}
                            disabled={processing[sr.id]}
                            className="btn-danger btn-sm flex-1 gap-1">
                            <XCircle size={12} /> 반려
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">처리완료</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

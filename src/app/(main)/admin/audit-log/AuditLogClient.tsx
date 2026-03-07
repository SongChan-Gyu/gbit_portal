"use client";
import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, ChevronLeft, ChevronRight, Clock, Eye, X } from "lucide-react";

interface AuditLog {
  id: string;
  entityType: string; entityId: string;
  action: string;
  actorId: string | null; actorName: string | null;
  actor: { name: string; empNo: string } | null;
  before: string | null; after: string | null;
  note: string | null; ip: string | null;
  createdAt: string;
}

const ACTION_COLOR: Record<string, string> = {
  CREATED:       "bg-blue-100 text-blue-700",
  UPDATED:       "bg-sky-100 text-sky-700",
  DELETED:       "bg-red-100 text-red-600",
  APPROVED:      "bg-green-100 text-green-700",
  REJECTED:      "bg-red-100 text-red-600",
  CANCELLED:     "bg-gray-100 text-gray-600",
  RESTORED:      "bg-teal-100 text-teal-700",
  GRANTED:       "bg-violet-100 text-violet-700",
  ADJUSTED:      "bg-amber-100 text-amber-700",
  DEACTIVATED:   "bg-orange-100 text-orange-700",
  LOGIN:         "bg-slate-100 text-slate-600",
  INVITE_SENT:   "bg-cyan-100 text-cyan-700",
  REGISTERED:    "bg-indigo-100 text-indigo-700",
  SCHEDULER_RUN: "bg-purple-100 text-purple-700",
};

const ENTITY_LABELS: Record<string, string> = {
  LeaveRequest:    "휴가신청",
  LeaveAllocation: "연차할당",
  Employee:        "사원",
  Scheduler:       "스케줄러",
  System:          "시스템",
};

export default function AuditLogClient() {
  const [logs, setLogs]         = useState<AuditLog[]>([]);
  const [loading, setLoading]   = useState(false);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ]               = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pg) });
    if (q)            params.set("q", q);
    if (typeFilter)   params.set("type", typeFilter);
    if (actionFilter) params.set("action", actionFilter);
    const res  = await fetch(`/api/admin/audit-log?${params}`);
    const data = await res.json();
    setLogs(data.logs ?? []);
    setTotal(data.total ?? 0);
    setPage(data.page ?? 1);
    setTotalPages(data.totalPages ?? 1);
    setLoading(false);
  }, [q, typeFilter, actionFilter]);

  useEffect(() => { load(1); }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load(1);
  }

  return (
    <div className="space-y-4">
      {/* 필터 */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input className="input pl-8 text-sm" placeholder="노트 검색..." value={q}
            onChange={e => setQ(e.target.value)}/>
        </div>
        <select className="input text-sm w-36" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">전체 유형</option>
          {Object.entries(ENTITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input text-sm w-36" value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="">전체 액션</option>
          {Object.keys(ACTION_COLOR).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button type="submit" className="btn-primary text-sm px-4">검색</button>
        <button type="button" onClick={() => load(page)} className="btn-secondary text-sm px-3" title="새로고침">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""}/>
        </button>
      </form>

      {/* 요약 */}
      <p className="text-xs text-gray-500">총 <strong className="text-gray-800">{total.toLocaleString()}</strong>건</p>

      {/* 테이블 */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        {loading ? (
          <div className="text-center py-12 text-sm text-gray-400">불러오는 중...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">로그가 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">시각</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">유형</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">액션</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">실행자</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 hidden lg:table-cell">노트</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock size={11}/>
                      {new Date(log.createdAt).toLocaleString("ko-KR", {
                        month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit"
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                      {ENTITY_LABELS[log.entityType] ?? log.entityType}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ACTION_COLOR[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {log.actor?.name ?? log.actorName ?? <span className="text-gray-400">시스템</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate hidden lg:table-cell">
                    {log.note ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {(log.before || log.after) && (
                      <button onClick={() => setDetailLog(log)}
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded hover:bg-blue-50 transition">
                        <Eye size={11}/> 보기
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => load(page - 1)} disabled={page <= 1}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 transition">
            <ChevronLeft size={16}/>
          </button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button onClick={() => load(page + 1)} disabled={page >= totalPages}
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 transition">
            <ChevronRight size={16}/>
          </button>
        </div>
      )}

      {/* 상세 모달 */}
      {detailLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDetailLog(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-xl">
              <h3 className="font-bold text-gray-800">
                {ENTITY_LABELS[detailLog.entityType] ?? detailLog.entityType} — {detailLog.action}
              </h3>
              <button onClick={() => setDetailLog(null)} className="p-1.5 rounded hover:bg-gray-100">
                <X size={16}/>
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-gray-500">엔티티 ID</span><p className="font-mono text-gray-700 mt-0.5">{detailLog.entityId}</p></div>
                <div><span className="text-gray-500">실행자</span><p className="font-medium mt-0.5">{detailLog.actor?.name ?? detailLog.actorName ?? "시스템"}</p></div>
                <div><span className="text-gray-500">시각</span><p className="mt-0.5">{new Date(detailLog.createdAt).toLocaleString("ko-KR")}</p></div>
                {detailLog.note && <div className="col-span-2"><span className="text-gray-500">노트</span><p className="mt-0.5">{detailLog.note}</p></div>}
              </div>
              {detailLog.before && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">변경 전 (Before)</p>
                  <pre className="text-[11px] bg-red-50 border border-red-100 rounded p-3 overflow-x-auto text-red-800">
                    {JSON.stringify(JSON.parse(detailLog.before), null, 2)}
                  </pre>
                </div>
              )}
              {detailLog.after && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">변경 후 (After)</p>
                  <pre className="text-[11px] bg-green-50 border border-green-100 rounded p-3 overflow-x-auto text-green-800">
                    {JSON.stringify(JSON.parse(detailLog.after), null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

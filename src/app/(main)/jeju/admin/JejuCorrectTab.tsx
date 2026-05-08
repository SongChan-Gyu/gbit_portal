"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, Edit2, Check, X } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "복지부 승인 대기",
  STEP1_APPROVED: "입금확인 대기",
  APPROVED: "완료",
  REJECTED: "반려",
  CANCELLED: "취소",
  CANCEL_REQUESTED: "취소 요청 중",
  CANCEL_STEP1_APPROVED: "입금취소 대기",
};
const STATUS_CLS: Record<string, string> = {
  PENDING: "badge-warning",
  STEP1_APPROVED: "badge-info",
  APPROVED: "badge-success",
  REJECTED: "badge-danger",
  CANCELLED: "badge-default",
  CANCEL_REQUESTED: "badge-warning",
  CANCEL_STEP1_APPROVED: "badge-warning",
};

type Row = {
  id: string;
  employeeName: string;
  empNo: string;
  teamName: string | null;
  startDate: string;
  endDate: string;
  nights: number;
  status: string;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  depositorName: string;
  reason: string | null;
};

type EditForm = {
  startDate: string;
  endDate: string;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  depositorName: string;
  reason: string;
};

export default function JejuCorrectTab() {
  const [q, setQ] = useState("");
  const [inputQ, setInputQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const pageSize = 30;

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (q) params.set("q", q);
      const res = await fetch(`/api/jeju/admin/correct?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "조회 실패");
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message ?? "로드 실패" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  function openEdit(r: Row) {
    setEditId(r.id);
    setEditForm({
      startDate: r.startDate,
      endDate: r.endDate,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestCount: r.guestCount,
      depositorName: r.depositorName,
      reason: r.reason ?? "",
    });
    setMsg(null);
  }

  function closeEdit() {
    setEditId(null);
    setEditForm(null);
  }

  async function saveEdit(id: string) {
    if (!editForm) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/jeju/admin/correct", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...editForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");
      setMsg({ type: "ok", text: "정정 완료되었습니다." });
      closeEdit();
      load();
    } catch (e: any) {
      setMsg({ type: "err", text: e?.message ?? "저장 실패" });
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
        <p className="text-sm font-semibold text-orange-900">⚠️ 데이터 정정 탭</p>
        <p className="text-xs text-orange-700 mt-0.5">
          이관 처리 등 관리 목적의 일자·투숙 정보 직접 수정 기능입니다. 변경 이력은 감사 로그에 기록됩니다.
        </p>
      </div>

      {/* 검색 */}
      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(inputQ); }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            className="input w-full pl-9"
            placeholder="신청자·투숙객·연락처 검색"
            value={inputQ}
            onChange={(e) => setInputQ(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary px-4">검색</button>
        {q && (
          <button type="button" className="btn-secondary px-3" onClick={() => { setInputQ(""); setQ(""); setPage(1); }}>
            초기화
          </button>
        )}
      </form>

      {/* 메시지 */}
      {msg && (
        <div className={`text-sm rounded-xl px-4 py-3 border ${
          msg.type === "ok"
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-red-50 text-red-700 border-red-200"
        }`}>
          {msg.text}
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="py-8 text-center text-gray-400">로딩 중...</div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-gray-400">검색 결과가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm"
            >
              {editId === r.id && editForm ? (
                /* 수정 폼 */
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide">정정 중</p>
                    <button type="button" onClick={closeEdit} className="p-1 text-gray-400 hover:text-gray-600">
                      <X size={16} />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">
                    {r.employeeName} <span className="text-xs text-gray-400">{r.empNo}</span>
                    {r.teamName && <span className="text-xs text-gray-500 ml-1">· {r.teamName}</span>}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">입실일 *</label>
                      <input
                        type="date"
                        className="input w-full"
                        value={editForm.startDate}
                        onChange={(e) => setEditForm((f) => f && { ...f, startDate: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">퇴실일 *</label>
                      <input
                        type="date"
                        className="input w-full"
                        value={editForm.endDate}
                        onChange={(e) => setEditForm((f) => f && { ...f, endDate: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">투숙객명 *</label>
                      <input
                        type="text"
                        className="input w-full"
                        value={editForm.guestName}
                        onChange={(e) => setEditForm((f) => f && { ...f, guestName: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">연락처 *</label>
                      <input
                        type="tel"
                        className="input w-full"
                        value={editForm.guestPhone}
                        onChange={(e) => setEditForm((f) => f && { ...f, guestPhone: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">인원 *</label>
                      <input
                        type="number"
                        min={1}
                        className="input w-full"
                        value={editForm.guestCount}
                        onChange={(e) => setEditForm((f) => f && { ...f, guestCount: parseInt(e.target.value) || 1 })}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">입금자명</label>
                      <input
                        type="text"
                        className="input w-full"
                        value={editForm.depositorName}
                        onChange={(e) => setEditForm((f) => f && { ...f, depositorName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">사유</label>
                    <input
                      type="text"
                      className="input w-full"
                      value={editForm.reason}
                      onChange={(e) => setEditForm((f) => f && { ...f, reason: e.target.value })}
                      placeholder="선택"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={closeEdit}
                      disabled={saving}
                      className="min-h-[44px] rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(r.id)}
                      disabled={saving}
                      className="min-h-[44px] rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {saving ? "저장 중..." : <><Check size={15} /> 정정 저장</>}
                    </button>
                  </div>
                </div>
              ) : (
                /* 목록 행 */
                <div className="p-3.5 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-gray-900 text-sm">{r.employeeName}</span>
                      <span className="text-xs text-gray-400">{r.empNo}</span>
                      {r.teamName && <span className="text-xs text-gray-500">· {r.teamName}</span>}
                      <span className={`badge text-xs ${STATUS_CLS[r.status] ?? "badge-default"}`}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-800 tabular-nums">
                      {r.startDate} ~ {r.endDate}
                      <span className="ml-1.5 text-xs text-gray-500">{r.nights}박</span>
                    </p>
                    <p className="text-xs text-gray-600">
                      {r.guestName} · {r.guestCount}명
                      {r.guestPhone ? ` · ${r.guestPhone}` : ""}
                      {r.depositorName ? ` · 입금 ${r.depositorName}` : ""}
                    </p>
                    {r.reason && <p className="text-xs text-gray-400 italic">{r.reason}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="shrink-0 p-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 transition-colors"
                    title="정정"
                  >
                    <Edit2 size={15} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 페이지 네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-600 tabular-nums">
            {page} / {totalPages}
            <span className="ml-2 text-gray-400">({total}건)</span>
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

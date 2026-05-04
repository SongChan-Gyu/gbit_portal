"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  guestCount: number;
  statusLabel: string;
};

export default function JejuExternalStayClient({ token }: { token: string }) {
  const [phase, setPhase] = useState<"loading" | "locked" | "ready" | "bad">("loading");
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState<Row[]>([]);
  const [unlocking, setUnlocking] = useState(false);

  const enc = encodeURIComponent(token);

  const loadBookings = useCallback(async () => {
    const r = await fetch(`/api/jeju/external-calendar/${enc}/bookings`, { credentials: "include" });
    const data = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(data?.items)) {
      setItems(data.items as Row[]);
      setPhase("ready");
      setMsg("");
      return;
    }
    if (r.status === 401) {
      setPhase("locked");
      setMsg("");
      return;
    }
    if (r.status === 404) {
      setPhase("bad");
      setMsg(typeof data?.error === "string" ? data.error : "유효하지 않거나 비활성화된 링크입니다.");
      return;
    }
    setPhase("bad");
    setMsg(typeof data?.error === "string" ? data.error : "일정을 불러오지 못했습니다.");
  }, [enc]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setMsg("");
    const r = await fetch(`/api/jeju/external-calendar/${enc}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pin: pin.replace(/\D/g, "").slice(0, 4) }),
    });
    const data = await r.json().catch(() => ({}));
    setUnlocking(false);
    if (!r.ok) {
      setMsg(typeof data?.error === "string" ? data.error : "잠금 해제에 실패했습니다.");
      return;
    }
    setPin("");
    await loadBookings();
  }

  if (phase === "loading") {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-500 text-sm">불러오는 중…</div>
    );
  }

  if (phase === "bad") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-sm">{msg}</div>
    );
  }

  if (phase === "locked") {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <p className="text-sm text-gray-600">관리자가 알려준 <strong>4자리 숫자 비밀번호</strong>를 입력하세요.</p>
        <form onSubmit={unlock} className="space-y-3">
          <div>
            <label className="label">비밀번호 (4자리)</label>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              className="input w-full tracking-widest text-center text-lg font-mono"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
            />
          </div>
          {msg && <p className="text-sm text-rose-600">{msg}</p>}
          <button type="submit" disabled={unlocking || pin.length !== 4} className="btn-primary w-full">
            {unlocking ? "확인 중…" : "확인"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        입실일·퇴실일은 한국 달력 기준입니다. 예약확정·입금확인 대기 건만 표시됩니다.
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-600">
              <th className="px-3 py-2 font-medium">입실</th>
              <th className="px-3 py-2 font-medium">퇴실</th>
              <th className="px-3 py-2 font-medium">박</th>
              <th className="px-3 py-2 font-medium">입실자</th>
              <th className="px-3 py-2 font-medium">인원</th>
              <th className="px-3 py-2 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                  해당 기간에 표시할 일정이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.checkIn}</td>
                  <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.checkOut}</td>
                  <td className="px-3 py-2 tabular-nums">{r.nights}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.guestName}</td>
                  <td className="px-3 py-2 tabular-nums">{r.guestCount}</td>
                  <td className="px-3 py-2 text-gray-600">{r.statusLabel}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

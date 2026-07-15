"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMDWithDayFromYMD } from "@/lib/dateUtils";

type Row = {
  id: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  guestPhone: string;
  guestCount: number;
  statusLabel: string;
};

function formatStayDate(ymd: string) {
  return formatMDWithDayFromYMD(ymd);
}

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return raw.trim();
}

function StatusBadge({ label }: { label: string }) {
  const confirmed = label === "예약확정";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
        confirmed ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200/80"
      }`}
    >
      {label}
    </span>
  );
}

function BookingCard({ row }: { row: Row }) {
  const phone = formatPhone(row.guestPhone);
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm space-y-2.5 min-w-0">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate" title={row.guestName}>
            {row.guestName}
          </p>
          {phone ? (
            <a href={`tel:${row.guestPhone.replace(/\D/g, "")}`} className="text-sm text-sky-700 tabular-nums mt-0.5 inline-block">
              {phone}
            </a>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">연락처 없음</p>
          )}
        </div>
        <StatusBadge label={row.statusLabel} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm min-w-0">
        <div className="min-w-0">
          <dt className="text-[11px] text-gray-500">입실</dt>
          <dd className="tabular-nums text-gray-900">{formatStayDate(row.checkIn)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-gray-500">퇴실</dt>
          <dd className="tabular-nums text-gray-900">{formatStayDate(row.checkOut)}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-gray-500">박수</dt>
          <dd className="tabular-nums text-gray-900">{row.nights}박</dd>
        </div>
        <div>
          <dt className="text-[11px] text-gray-500">인원</dt>
          <dd className="tabular-nums text-gray-900">{row.guestCount}명</dd>
        </div>
      </dl>
    </article>
  );
}

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
      <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-sm break-words">{msg}</div>
    );
  }

  if (phase === "locked") {
    return (
      <div className="max-w-sm mx-auto">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-gray-900">비밀번호 입력</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              관리자가 알려준 <strong className="text-gray-700">4자리 숫자</strong>를 입력하세요.
            </p>
          </div>
          <form onSubmit={unlock} className="space-y-3">
            <div>
              <label className="label">비밀번호</label>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                className="input w-full tracking-[0.35em] text-center text-lg font-mono"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
              />
            </div>
            {msg && <p className="text-sm text-rose-600 break-words">{msg}</p>}
            <button type="submit" disabled={unlocking || pin.length !== 4} className="btn-primary w-full min-h-[44px]">
              {unlocking ? "확인 중…" : "확인"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0">
      <p className="text-xs text-gray-500 leading-relaxed">
        입실일·퇴실일은 한국 달력 기준입니다. 예약확정·입금확인 대기 건만 표시됩니다.
      </p>

      {items.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
          해당 기간에 표시할 일정이 없습니다.
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {items.map((r) => (
              <BookingCard key={r.id} row={r} />
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full min-w-[640px] text-sm table-fixed">
              <colgroup>
                <col className="w-[7.5rem]" />
                <col className="w-[7.5rem]" />
                <col className="w-[3rem]" />
                <col className="w-[6rem]" />
                <col className="w-[8rem]" />
                <col className="w-[3rem]" />
                <col className="w-[6.5rem]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-600">
                  <th className="px-3 py-2.5 font-medium">입실</th>
                  <th className="px-3 py-2.5 font-medium">퇴실</th>
                  <th className="px-3 py-2.5 font-medium">박</th>
                  <th className="px-3 py-2.5 font-medium">입실자</th>
                  <th className="px-3 py-2.5 font-medium">연락처</th>
                  <th className="px-3 py-2.5 font-medium text-center">인원</th>
                  <th className="px-3 py-2.5 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const phone = formatPhone(r.guestPhone);
                  return (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0 align-top">
                      <td className="px-3 py-2.5 tabular-nums text-gray-900 whitespace-nowrap">{formatStayDate(r.checkIn)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-900 whitespace-nowrap">{formatStayDate(r.checkOut)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-900">{r.nights}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900 truncate" title={r.guestName}>
                        {r.guestName}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-700">
                        {phone ? (
                          <a href={`tel:${r.guestPhone.replace(/\D/g, "")}`} className="text-sky-700 hover:underline">
                            {phone}
                          </a>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-900 text-center">{r.guestCount}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge label={r.statusLabel} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-[11px] text-gray-400 text-right tabular-nums">총 {items.length}건</p>
    </div>
  );
}

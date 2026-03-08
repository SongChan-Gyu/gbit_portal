"use client";

import { useState, useEffect } from "react";
import { formatJejuAccountNumber } from "@/lib/jeju";
import type { JejuDepositAccount } from "@/lib/jeju";

export default function JejuSettingsTab() {
  const [depositAccount, setDepositAccount] = useState<JejuDepositAccount>({
    bankName: "신한은행",
    accountHolder: "이기광",
    accountNumber: "1105423446194",
  });
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newBlockDate, setNewBlockDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/jeju-settings")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("조회 실패")))
      .then((data: { depositAccount?: JejuDepositAccount; blockedDates?: string[] }) => {
        if (data.depositAccount) setDepositAccount(data.depositAccount);
        if (Array.isArray(data.blockedDates)) setBlockedDates(data.blockedDates);
      })
      .catch(() => setMessage({ type: "err", text: "설정을 불러오지 못했습니다." }))
      .finally(() => setLoading(false));
  }, []);

  async function saveAccount() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/jeju-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ depositAccount }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) setMessage({ type: "ok", text: "이체 계좌가 저장되었습니다." });
    else setMessage({ type: "err", text: data.error || "저장 실패" });
  }

  async function saveBlocked() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/jeju-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockedDates }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) setMessage({ type: "ok", text: "예약 불가일이 저장되었습니다." });
    else setMessage({ type: "err", text: data.error || "저장 실패" });
  }

  function addBlockedDate() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newBlockDate)) return;
    if (blockedDates.includes(newBlockDate)) return;
    setBlockedDates((prev) => [...prev, newBlockDate].sort());
    setNewBlockDate("");
  }

  function removeBlockedDate(date: string) {
    setBlockedDates((prev) => prev.filter((d) => d !== date));
  }

  if (loading) {
    return <div className="py-8 text-center text-gray-500">로딩 중...</div>;
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-gray-500">
        제주도 숙소 예약금 이체 계좌와 예약 불가일을 설정합니다. 예약금은 고정 10만원이며, 이사님 계좌로 이체하도록 여기서 설정한 계좌로 안내됩니다.
      </p>

      {message && (
        <p className={`text-sm rounded-lg px-3 py-2 ${message.type === "ok" ? "bg-green-50 text-green-800" : "bg-rose-50 text-rose-700"}`}>
          {message.text}
        </p>
      )}

      {/* 예약금 이체 계좌 */}
      <div className="card max-w-xl">
        <h3 className="font-semibold text-gray-800 mb-3">예약금 이체 계좌</h3>
        <p className="text-xs text-gray-500 mb-4">예약 시 안내되는 이사님 계좌입니다. 예금주·계좌번호를 수정할 수 있습니다.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">은행명</label>
            <input
              type="text"
              className="input w-full"
              value={depositAccount.bankName}
              onChange={(e) => setDepositAccount((a) => ({ ...a, bankName: e.target.value }))}
              placeholder="예: 신한은행"
            />
          </div>
          <div>
            <label className="label">예금주</label>
            <input
              type="text"
              className="input w-full"
              value={depositAccount.accountHolder}
              onChange={(e) => setDepositAccount((a) => ({ ...a, accountHolder: e.target.value }))}
              placeholder="예: 이기광"
            />
          </div>
          <div>
            <label className="label">계좌번호</label>
            <input
              type="text"
              className="input w-full"
              value={depositAccount.accountNumber}
              onChange={(e) => setDepositAccount((a) => ({ ...a, accountNumber: e.target.value.replace(/\D/g, "") }))}
              placeholder="숫자만 입력"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          안내 시 표시: {depositAccount.bankName} {depositAccount.accountHolder} {formatJejuAccountNumber(depositAccount.accountNumber)}
        </p>
        <button type="button" onClick={saveAccount} disabled={saving} className="btn-primary mt-4">
          {saving ? "저장 중..." : "계좌 저장"}
        </button>
      </div>

      {/* 예약 불가일 */}
      <div className="card max-w-xl">
        <h3 className="font-semibold text-gray-800 mb-3">예약 불가일</h3>
        <p className="text-xs text-gray-500 mb-4">특정 날짜를 예약 불가로 설정하면 해당 일자에는 신청할 수 없습니다.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="date"
            className="input w-40"
            value={newBlockDate}
            onChange={(e) => setNewBlockDate(e.target.value)}
          />
          <button type="button" onClick={addBlockedDate} className="btn-secondary btn-sm">
            추가
          </button>
        </div>
        {blockedDates.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {blockedDates.map((d) => (
              <li key={d} className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 px-3 py-1 text-sm">
                {d}
                <button type="button" onClick={() => removeBlockedDate(d)} className="text-rose-600 hover:text-rose-800 font-bold leading-none">
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={saveBlocked} disabled={saving} className="btn-primary mt-4">
          {saving ? "저장 중..." : "예약 불가일 저장"}
        </button>
      </div>
    </div>
  );
}

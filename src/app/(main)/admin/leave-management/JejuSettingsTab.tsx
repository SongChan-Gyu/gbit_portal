"use client";

import { useState, useEffect } from "react";
import { formatJejuAccountNumber } from "@/lib/jeju";
import DatePickerButton from "@/components/ui/DatePickerButton";
import type { JejuDepositAccount } from "@/lib/jeju";

type NotifyVia = "email" | "alimtalk" | "both";
type NotifyContact = { phone?: string; email?: string; notifyVia?: NotifyVia };
type JejuNotifyConfig = { step1?: NotifyContact; step2?: NotifyContact };

export default function JejuSettingsTab() {
  const [depositAccount, setDepositAccount] = useState<JejuDepositAccount>({
    bankName: "신한은행",
    accountHolder: "이기광",
    accountNumber: "1105423446194",
  });
  const [maxNights, setMaxNights] = useState(14);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newBlockDate, setNewBlockDate] = useState("");
  const [notifyConfig, setNotifyConfig] = useState<JejuNotifyConfig>({ step1: {}, step2: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/jeju-settings")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("조회 실패")))
      .then((data: { depositAccount?: JejuDepositAccount; blockedDates?: string[]; maxNights?: number; notifyConfig?: JejuNotifyConfig }) => {
        if (data.depositAccount) setDepositAccount(data.depositAccount);
        if (Array.isArray(data.blockedDates)) setBlockedDates(data.blockedDates);
        if (typeof data.maxNights === "number" && data.maxNights >= 1) setMaxNights(data.maxNights);
        if (data.notifyConfig) setNotifyConfig(data.notifyConfig);
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

  async function saveNotifyConfig() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/jeju-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notifyConfig }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) setMessage({ type: "ok", text: "알림 수신자가 저장되었습니다." });
    else setMessage({ type: "err", text: data.error || "저장 실패" });
  }

  async function saveMaxNights() {
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/admin/jeju-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxNights }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) setMessage({ type: "ok", text: "최대 연박이 저장되었습니다." });
    else setMessage({ type: "err", text: data.error || "저장 실패" });
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

      {/* 결재 단계별 알림 수신자 */}
      <div className="card max-w-xl">
        <h3 className="font-semibold text-gray-800 mb-1">결재 알림 수신자</h3>
        <p className="text-xs text-gray-500 mb-4">
          1차(복지)·2차(PM) 각각 이메일·알림톡 수신 방식을 선택합니다. 알림톡만 선택한 경우 전화번호가 필요하고,
          이메일만 선택한 경우 이메일이 필요합니다. 둘 다 선택 시 두 채널 모두 발송됩니다.
        </p>
        <div className="space-y-4">
          {/* 1차 (복지부) */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">1차 결재 담당자 (복지부)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">알림 채널</label>
                <select
                  className="input w-full"
                  value={notifyConfig.step1?.notifyVia ?? "email"}
                  onChange={(e) =>
                    setNotifyConfig((c) => ({
                      ...c,
                      step1: { ...c.step1, notifyVia: e.target.value as NotifyVia },
                    }))
                  }
                >
                  <option value="email">이메일만</option>
                  <option value="alimtalk">알림톡만</option>
                  <option value="both">이메일 + 알림톡</option>
                </select>
              </div>
              <div>
                <label className="label">이메일</label>
                <input
                  type="email"
                  className="input w-full"
                  value={notifyConfig.step1?.email ?? ""}
                  onChange={(e) => setNotifyConfig((c) => ({ ...c, step1: { ...c.step1, email: e.target.value } }))}
                  placeholder="welfare@company.com"
                />
              </div>
              <div>
                <label className="label">전화번호 (알림톡)</label>
                <input
                  type="tel"
                  className="input w-full"
                  value={notifyConfig.step1?.phone ?? ""}
                  onChange={(e) => setNotifyConfig((c) => ({ ...c, step1: { ...c.step1, phone: e.target.value } }))}
                  placeholder="01012345678"
                />
              </div>
            </div>
          </div>
          {/* 2차 (PM) */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">2차 결재 담당자 (PM — 입금확인)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">알림 채널</label>
                <select
                  className="input w-full"
                  value={notifyConfig.step2?.notifyVia ?? "email"}
                  onChange={(e) =>
                    setNotifyConfig((c) => ({
                      ...c,
                      step2: { ...c.step2, notifyVia: e.target.value as NotifyVia },
                    }))
                  }
                >
                  <option value="email">이메일만</option>
                  <option value="alimtalk">알림톡만</option>
                  <option value="both">이메일 + 알림톡</option>
                </select>
              </div>
              <div>
                <label className="label">이메일</label>
                <input
                  type="email"
                  className="input w-full"
                  value={notifyConfig.step2?.email ?? ""}
                  onChange={(e) => setNotifyConfig((c) => ({ ...c, step2: { ...c.step2, email: e.target.value } }))}
                  placeholder="pm@company.com"
                />
              </div>
              <div>
                <label className="label">전화번호 (알림톡)</label>
                <input
                  type="tel"
                  className="input w-full"
                  value={notifyConfig.step2?.phone ?? ""}
                  onChange={(e) => setNotifyConfig((c) => ({ ...c, step2: { ...c.step2, phone: e.target.value } }))}
                  placeholder="01011111111"
                />
              </div>
            </div>
          </div>
        </div>
        <button type="button" onClick={saveNotifyConfig} disabled={saving} className="btn-primary mt-4">
          {saving ? "저장 중..." : "알림 수신자 저장"}
        </button>
      </div>

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

      {/* 최대 연박 */}
      <div className="card max-w-xl">
        <h3 className="font-semibold text-gray-800 mb-3">최대 연박</h3>
        <p className="text-xs text-gray-500 mb-4">한 번에 예약 가능한 최대 숙박 일수입니다. (예: 14일이면 최대 14박까지 선택 가능)</p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="number"
            min={1}
            max={365}
            className="input w-24"
            value={maxNights}
            onChange={(e) => setMaxNights(Math.min(365, Math.max(1, parseInt(e.target.value, 10) || 1)))}
          />
          <span className="text-sm text-gray-600">박</span>
          <button type="button" onClick={saveMaxNights} disabled={saving} className="btn-primary">
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {/* 예약 불가일 */}
      <div className="card max-w-xl">
        <h3 className="font-semibold text-gray-800 mb-3">예약 불가일</h3>
        <p className="text-xs text-gray-500 mb-4">날짜를 선택 후 추가를 누르고, 필요 시 목록에서 ×로 삭제한 뒤 저장하세요. 여러 날짜를 추가·삭제한 후 한 번에 저장할 수 있습니다.</p>
        <div className="flex flex-wrap gap-2 items-center">
          <DatePickerButton
            value={newBlockDate}
            onChange={setNewBlockDate}
            className="w-40"
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

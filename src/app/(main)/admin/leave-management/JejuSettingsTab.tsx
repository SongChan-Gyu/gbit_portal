"use client";

import { useState, useEffect } from "react";
import { formatJejuAccountNumber } from "@/lib/jeju";
import DatePickerButton from "@/components/ui/DatePickerButton";
import type { JejuDepositAccount } from "@/lib/jeju";

type NotifyVia = "email" | "alimtalk" | "both";
type NotifyContact = { phone?: string; phone2?: string; email?: string; notifyVia?: NotifyVia };
type JejuNotifyConfig = { step1?: NotifyContact; step2?: NotifyContact };

type ExternalStayViewState = { enabled: boolean; urlToken: string; pinIsSet: boolean };

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
  const [externalStay, setExternalStay] = useState<ExternalStayViewState>({
    enabled: false,
    urlToken: "",
    pinIsSet: false,
  });
  const [portalBaseUrl, setPortalBaseUrl] = useState("");
  const [extPin, setExtPin] = useState("");

  useEffect(() => {
    fetch("/api/admin/jeju-settings")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("조회 실패")))
      .then((data: {
        depositAccount?: JejuDepositAccount;
        blockedDates?: string[];
        maxNights?: number;
        notifyConfig?: JejuNotifyConfig;
        externalStayView?: ExternalStayViewState;
        portalBaseUrl?: string;
      }) => {
        if (data.depositAccount) setDepositAccount(data.depositAccount);
        if (Array.isArray(data.blockedDates)) setBlockedDates(data.blockedDates);
        if (typeof data.maxNights === "number" && data.maxNights >= 1) setMaxNights(data.maxNights);
        if (data.notifyConfig) setNotifyConfig(data.notifyConfig);
        if (data.externalStayView) setExternalStay(data.externalStayView);
        if (typeof data.portalBaseUrl === "string") setPortalBaseUrl(data.portalBaseUrl);
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

  async function saveExternalStay(opts?: { regenerateUrlToken?: boolean }) {
    if (externalStay.enabled && !externalStay.pinIsSet && extPin.length !== 4) {
      setMessage({ type: "err", text: "외부 링크를 켜려면 4자리 숫자 비밀번호를 입력하고 저장하세요." });
      return;
    }
    setSaving(true);
    setMessage(null);
    const externalStayView: Record<string, unknown> = { enabled: externalStay.enabled };
    if (opts?.regenerateUrlToken) externalStayView.regenerateUrlToken = true;
    if (extPin.length === 4) externalStayView.pin = extPin;
    const res = await fetch("/api/admin/jeju-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalStayView }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setExtPin("");
      setMessage({ type: "ok", text: opts?.regenerateUrlToken ? "외부 링크가 새로 발급되었습니다." : "외부 일정 설정이 저장되었습니다." });
      const r2 = await fetch("/api/admin/jeju-settings");
      if (r2.ok) {
        const d2 = await r2.json();
        if (d2.externalStayView) setExternalStay(d2.externalStayView);
        if (typeof d2.portalBaseUrl === "string") setPortalBaseUrl(d2.portalBaseUrl);
      }
    } else setMessage({ type: "err", text: data.error || "저장 실패" });
  }

  const externalFullUrl =
    externalStay.urlToken.length > 0
      ? portalBaseUrl
        ? `${portalBaseUrl}/jeju-external/${externalStay.urlToken}`
        : `(배포 주소)/jeju-external/${externalStay.urlToken}`
      : "";

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

      {/* 외부(청소 등) 입실 일정 링크 */}
      <div className="card max-w-xl border-blue-100 bg-blue-50/40">
        <h3 className="font-semibold text-gray-800 mb-1">외부용 입실 일정 링크</h3>
        <p className="text-xs text-gray-600 mb-4">
          로그인 없이 <strong>입실·퇴실일, 입실자명, 인원</strong>만 보이게 합니다. 주소에 포함된 긴 토큰과 별도로{" "}
          <strong>4자리 숫자 비밀번호</strong>를 알려 주세요. 비밀번호만으로는 접근할 수 없습니다.
        </p>
        <label className="flex items-center gap-2 mb-3">
          <input
            type="checkbox"
            checked={externalStay.enabled}
            onChange={(e) => setExternalStay((s) => ({ ...s, enabled: e.target.checked }))}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-800">외부 링크 사용</span>
        </label>
        {externalStay.urlToken ? (
          <div className="mb-3">
            <label className="label">공유 링크</label>
            <div className="flex gap-2 flex-wrap">
              <input readOnly className="input flex-1 min-w-[12rem] text-xs font-mono" value={externalFullUrl} />
              <button
                type="button"
                className="btn-secondary shrink-0"
                onClick={() => void navigator.clipboard.writeText(portalBaseUrl ? externalFullUrl : `/jeju-external/${externalStay.urlToken}`)}
              >
                복사
              </button>
            </div>
            {!portalBaseUrl && (
              <p className="text-xs text-amber-700 mt-1">NEXTAUTH_URL이 없으면 전체 URL이 비어 보일 수 있습니다. 서버 환경 변수에 실제 도메인을 넣으세요.</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500 mb-3">저장 시 링크용 토큰이 자동 생성됩니다.</p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 items-end mb-3">
          <div>
            <label className="label">4자리 비밀번호 (신규·변경 시만 입력)</label>
            <input
              inputMode="numeric"
              maxLength={4}
              className="input w-full tracking-widest font-mono"
              value={extPin}
              onChange={(e) => setExtPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={externalStay.pinIsSet ? "변경 시에만 입력" : "예: 1234"}
            />
          </div>
          <p className="text-xs text-gray-500 sm:col-span-2">
            현재 비밀번호 설정: {externalStay.pinIsSet ? "됨" : "안 됨"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void saveExternalStay()} disabled={saving} className="btn-primary">
            {saving ? "저장 중…" : "외부 링크 설정 저장"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("기존에 나눠 준 링크는 더 이상 쓸 수 없습니다. 새 링크로 바꿀까요?")) return;
              void saveExternalStay({ regenerateUrlToken: true });
            }}
            disabled={saving || !externalStay.urlToken}
            className="btn-outline"
          >
            링크 재발급
          </button>
        </div>
      </div>

      {/* 결재 단계별 알림 수신자 */}
      <div className="card max-w-xl">
        <h3 className="font-semibold text-gray-800 mb-1">결재 알림 수신자</h3>
        <p className="text-xs text-gray-500 mb-4">
          복지부 승인 단계·PM 입금확인 단계 각각 이메일·알림톡 수신 방식을 선택합니다. 알림톡만 선택한 경우 전화번호가 필요하고,
          이메일만 선택한 경우 이메일이 필요합니다. 둘 다 선택 시 두 채널 모두 발송됩니다. 복지부 단계는 알림톡 수신 번호를 최대
          두 명(두 번호)까지 넣을 수 있습니다.
        </p>
        <div className="space-y-4">
          {/* 복지부 승인 알림 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">복지부 승인 알림 (담당)</p>
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
                <label className="label">전화번호 (알림톡) 1</label>
                <input
                  type="tel"
                  className="input w-full"
                  value={notifyConfig.step1?.phone ?? ""}
                  onChange={(e) => setNotifyConfig((c) => ({ ...c, step1: { ...c.step1, phone: e.target.value } }))}
                  placeholder="01012345678"
                />
              </div>
              <div>
                <label className="label">전화번호 (알림톡) 2 — 선택</label>
                <input
                  type="tel"
                  className="input w-full"
                  value={notifyConfig.step1?.phone2 ?? ""}
                  onChange={(e) => setNotifyConfig((c) => ({ ...c, step1: { ...c.step1, phone2: e.target.value } }))}
                  placeholder="추가 수신자 번호"
                />
              </div>
            </div>
          </div>
          {/* 2차 (PM) */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">PM 입금확인 알림 (담당)</p>
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

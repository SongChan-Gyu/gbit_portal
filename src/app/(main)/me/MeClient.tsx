"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Emp = {
  id: string;
  empNo: string;
  name: string;
  position: string;
  team: { name: string } | null;
  phone: string;
  email: string | null;
  emailEnabled: boolean;
  alimtalkEnabled: boolean;
};

export default function MeClient({ initial }: { initial: Emp }) {
  const router = useRouter();
  const [form, setForm] = useState({
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    emailEnabled: !!initial.emailEnabled,
    alimtalkEnabled: !!initial.alimtalkEnabled,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    setOkMsg("");
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: form.phone,
        email: form.email,
        emailEnabled: form.emailEnabled,
        alimtalkEnabled: form.alimtalkEnabled,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "저장에 실패했습니다.");
      return;
    }
    setOkMsg("저장되었습니다.");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm space-y-5">
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="font-semibold">{initial.name}</span>
          <span className="text-gray-500">{initial.empNo}</span>
          <span className="text-gray-500">{initial.team?.name ?? "팀 없음"}</span>
          <span className="text-gray-500">{initial.position}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">연락처</label>
          <input
            className="input w-full"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="010-0000-0000"
          />
        </div>
        <div>
          <label className="label">이메일</label>
          <input
            type="email"
            className="input w-full"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="example@email.com"
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">알림 수신 설정</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.emailEnabled}
            onChange={(e) => setForm((p) => ({ ...p, emailEnabled: e.target.checked }))}
          />
          <span className="text-sm text-gray-700">이메일 전송(수신) 사용</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.alimtalkEnabled}
            onChange={(e) => setForm((p) => ({ ...p, alimtalkEnabled: e.target.checked }))}
          />
          <span className="text-sm text-gray-700">카카오 알림톡 사용</span>
        </label>
        <p className="text-xs text-gray-500">
          기본값은 미사용입니다. 켜두면 휴가/제주 결재 등 알림이 발송될 수 있습니다.
        </p>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {okMsg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{okMsg}</p>}

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={() => router.back()}>뒤로</button>
        <button type="button" className="btn-primary flex-1" onClick={save} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  );
}


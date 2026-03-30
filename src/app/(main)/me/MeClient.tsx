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
  alimtalkEnabled: boolean;
};

export default function MeClient({ initial }: { initial: Emp }) {
  const router = useRouter();
  const [form, setForm] = useState({
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    alimtalkEnabled: !!initial.alimtalkEnabled,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwOkMsg, setPwOkMsg] = useState("");

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

  async function changePassword() {
    setPwError("");
    setPwOkMsg("");
    if (!pw.currentPassword || !pw.newPassword || !pw.confirmPassword) {
      setPwError("현재/새 비밀번호를 모두 입력해 주세요.");
      return;
    }
    if (pw.newPassword.length < 8) {
      setPwError("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (pw.newPassword !== pw.confirmPassword) {
      setPwError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setPwSaving(true);
    const res = await fetch("/api/me/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPwSaving(false);
    if (!res.ok) {
      setPwError(data.error ?? "비밀번호 변경에 실패했습니다.");
      return;
    }
    setPw({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPwOkMsg("비밀번호가 변경되었습니다.");
  }

  return (
    <div className="space-y-5">
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
        <div className="sm:col-span-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <label className="label mb-0">이메일</label>
            <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
              시스템 필수
            </span>
          </div>
          <input
            type="email"
            className="input w-full max-w-xl mt-1.5"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="example@email.com"
          />
          <p className="text-xs text-gray-500 mt-1.5">
            로그인·비밀번호 찾기·초대 등 안내는 이 주소로만 발송되며, 이메일 미수신 설정은 없습니다.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-gray-900">카카오 알림톡</p>
            <p className="text-xs text-gray-500">
              등록 휴대폰으로 휴가·초대 알림 등(선택)
            </p>
          </div>
          <label className="inline-flex items-center gap-2.5 cursor-pointer shrink-0 sm:pl-4">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={form.alimtalkEnabled}
              onChange={(e) => setForm((p) => ({ ...p, alimtalkEnabled: e.target.checked }))}
            />
            <span className="text-sm font-medium text-gray-800">수신 허용</span>
          </label>
        </div>
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

      <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
        <div>
          <p className="text-base font-semibold text-gray-900">비밀번호 변경</p>
          <p className="text-xs text-gray-500 mt-1">현재 비밀번호 확인 후 새 비밀번호로 변경합니다.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label">현재 비밀번호</label>
            <input
              type="password"
              className="input w-full"
              value={pw.currentPassword}
              onChange={(e) => setPw((p) => ({ ...p, currentPassword: e.target.value }))}
              autoComplete="current-password"
              placeholder="현재 비밀번호"
            />
          </div>
          <div>
            <label className="label">새 비밀번호</label>
            <input
              type="password"
              className="input w-full"
              value={pw.newPassword}
              onChange={(e) => setPw((p) => ({ ...p, newPassword: e.target.value }))}
              autoComplete="new-password"
              placeholder="8자 이상"
            />
          </div>
          <div>
            <label className="label">새 비밀번호 확인</label>
            <input
              type="password"
              className="input w-full"
              value={pw.confirmPassword}
              onChange={(e) => setPw((p) => ({ ...p, confirmPassword: e.target.value }))}
              autoComplete="new-password"
              placeholder="새 비밀번호 확인"
            />
          </div>
        </div>

        {pwError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pwError}</p>}
        {pwOkMsg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{pwOkMsg}</p>}

        <div className="flex justify-end">
          <button type="button" className="btn-primary min-w-36" onClick={changePassword} disabled={pwSaving}>
            {pwSaving ? "변경 중..." : "비밀번호 변경"}
          </button>
        </div>
      </div>
    </div>
  );
}


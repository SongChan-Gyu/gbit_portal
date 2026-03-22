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
        <div className="sm:col-span-2">
          <label className="label">이메일</label>
          <input
            type="email"
            className="input w-full max-w-xl"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="example@email.com"
          />
          <p className="text-xs text-gray-600 mt-2 leading-relaxed max-w-2xl">
            주소는 변경할 수 있습니다. 다만{" "}
            <span className="font-medium text-gray-800">
              아이디·비밀번호 찾기, 회원가입 초대, 관리자가 보내는 시스템 메일
            </span>
            등은 등록된 이메일로 발송되므로,{" "}
            <span className="font-medium text-gray-800">
              ‘이메일 발송 거부(미수신)’는 본인 설정에서 선택할 수 없습니다.
            </span>{" "}
            이메일을 비우면 발송 대상에서 제외될 수 있으나, 로그인·찾기 등에 불이익이 있을 수 있어 정확한 주소 유지를 권장합니다.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">카카오 알림톡</p>
        <p className="text-xs text-gray-600 leading-relaxed">
          아래를 켜면 등록된 휴대폰 번호로 알림톡이 갈 수 있습니다.{" "}
          <span className="font-medium text-gray-800">끄는 것은 본인이 선택할 수 있습니다.</span>
        </p>
        <ul className="text-xs text-gray-600 list-disc pl-4 space-y-1.5 leading-relaxed">
          <li>
            <span className="font-medium text-gray-700">휴가</span>: 신청 시 결재자에게 결재 요청 알림, 승인·반려 시 신청자에게 처리 결과 알림
          </li>
          <li>
            <span className="font-medium text-gray-700">회원 초대</span>: 관리자가 초대 발송 시 연락처로 알림톡이 갈 수 있음(운영 설정에 따름)
          </li>
          <li>
            제주 숙소 등 기타 알림은 시스템 연동 범위에 따라 발송될 수 있습니다.
          </li>
        </ul>
        <label className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            checked={form.alimtalkEnabled}
            onChange={(e) => setForm((p) => ({ ...p, alimtalkEnabled: e.target.checked }))}
          />
          <span className="text-sm text-gray-700">카카오 알림톡 수신 허용</span>
        </label>
        <p className="text-xs text-gray-500">
          기본값은 꺼져 있습니다. 필요할 때만 켜 주세요.
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


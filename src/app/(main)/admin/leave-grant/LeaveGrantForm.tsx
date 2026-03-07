"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LeaveGrantForm({
  employeeId, name, fiscalYear, balance,
}: {
  employeeId: string;
  name: string;
  fiscalYear: number;
  balance: { totalDays: number; specialDays: number; note: string | null } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    totalDays: String(balance?.totalDays ?? ""),
    specialDays: String(balance?.specialDays ?? ""),
    note: balance?.note ?? "",
  });
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    const res = await fetch("/api/admin/leave-grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employeeId, fiscalYear,
        totalDays: parseFloat(form.totalDays) || 0,
        specialDays: parseFloat(form.specialDays) || 0,
        note: form.note,
      }),
    });
    setLoading(false);
    if (res.ok) { setOpen(false); router.refresh(); }
    else { const d = await res.json(); alert(d.error ?? "오류 발생"); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary btn-sm">부여/수정</button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-bold text-gray-900">{name} — {fiscalYear}년 연차 설정</h3>
        <div>
          <label className="label">총 부여일수</label>
          <input type="number" step="0.5" className="input" value={form.totalDays}
            onChange={(e) => setForm({ ...form, totalDays: e.target.value })} />
        </div>
        <div>
          <label className="label">특별휴가 (근속·포상 등)</label>
          <input type="number" step="0.5" className="input" value={form.specialDays}
            onChange={(e) => setForm({ ...form, specialDays: e.target.value })} />
        </div>
        <div>
          <label className="label">비고</label>
          <input type="text" className="input" value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="예: 2025.05 근속휴가 5일 적용" />
        </div>
        <div className="flex gap-3">
          <button onClick={() => setOpen(false)} className="btn-secondary flex-1">취소</button>
          <button onClick={handleSave} className="btn-primary flex-1" disabled={loading}>
            {loading ? <span className="spinner" /> : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

const OPTIONS: { hours: 0 | 1 | 2 | 3; time: string; hint: string }[] = [
  { hours: 0, time: "11:00", hint: "0시간" },
  { hours: 1, time: "12:00", hint: "1시간" },
  { hours: 2, time: "13:00", hint: "2시간" },
  { hours: 3, time: "14:00", hint: "3시간" },
];

export default function JejuCheckoutDelayPicker({
  requestId,
  hours,
  allowed,
  onChanged,
}: {
  requestId: string;
  hours: number;
  allowed: boolean;
  onChanged: (hours: number, checkoutTime: string) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function select(next: 0 | 1 | 2 | 3) {
    if (next === hours || saving) return;
    if (!allowed && next > 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/jeju/checkout-delay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, hours: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data.error === "string" ? data.error : "퇴실 시간 변경에 실패했습니다.");
        return;
      }
      onChanged(next, typeof data.checkoutTime === "string" ? data.checkoutTime : OPTIONS[next].time);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 space-y-2">
      <p className="text-xs font-semibold text-slate-800">퇴실 지연</p>
      <div className="grid grid-cols-4 gap-1.5">
        {OPTIONS.map((opt) => {
          const selected = hours === opt.hours;
          const disabled = !allowed && opt.hours > 0;
          return (
            <button
              key={opt.hours}
              type="button"
              disabled={disabled || saving}
              onClick={() => select(opt.hours)}
              className={`min-h-[44px] rounded-lg border text-center px-1 py-1.5 touch-manipulation ${
                selected
                  ? "border-slate-800 bg-slate-800 text-white"
                  : disabled
                    ? "border-slate-200 bg-white text-slate-300 cursor-not-allowed"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-400"
              }`}
            >
              <span className="block text-sm font-semibold leading-tight">{opt.hint}</span>
              <span className={`block text-[10px] tabular-nums leading-tight mt-0.5 ${selected ? "text-slate-200" : "text-slate-500"}`}>
                {opt.time}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500 leading-snug">
        {allowed
          ? "0시간은 기본 퇴실 11:00입니다. 당일 입실 예약이 생기면 자동으로 0시간이 됩니다."
          : "퇴실 당일 입실 예약이 있어 지연 0시간(11:00)만 가능합니다."}
      </p>
    </div>
  );
}

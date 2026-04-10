"use client";

import { useMemo, useState } from "react";
import { formatMDWithDay } from "@/lib/dateUtils";
import { mergedLeaveTypeLabel } from "@/lib/leaveDisplay";

type RequestItem = {
  id: string;
  days: number;
  startDate: string;
  endDate: string;
  timeSlot?: string | null;
  leaveType: {
    name: string;
    color: string;
    applyGroupKey?: string | null;
    isHalf?: boolean;
    isAmOnly?: boolean;
    isPmOnly?: boolean;
    allowsFullDay?: boolean | null;
    allowsHalfDay?: boolean | null;
    halfDayAmPm?: string | null;
  };
};

type RequestRow = { id: string; items: RequestItem[] };

interface Props {
  requests: RequestRow[];
}

type UsageRow = {
  key: string;
  label: string;
  color: string;
  usedDays: number;
  lastUsedAt: number;
  entries: Array<{ id: string; period: string; days: number; startAt: number }>;
};

export default function MyLeaveByTypeTable({ requests }: Props) {
  const [selectedKey, setSelectedKey] = useState("ALL");

  const rows = useMemo<UsageRow[]>(() => {
    const map = new Map<string, UsageRow>();
    for (const req of requests) {
      for (const item of req.items) {
        const merged = mergedLeaveTypeLabel(item.leaveType as any, { timeSlot: item.timeSlot ?? null });
        const key = merged.mergedName;
        const c = merged.mergedColor ?? item.leaveType.color ?? "#334155";
        const s = item.startDate.slice(0, 10) === item.endDate.slice(0, 10)
          ? formatMDWithDay(new Date(item.startDate))
          : `${formatMDWithDay(new Date(item.startDate))} ~ ${formatMDWithDay(new Date(item.endDate))}`;
        const ts = new Date(item.startDate).getTime();
        const prev = map.get(key);
        if (!prev) {
          map.set(key, {
            key,
            label: merged.mergedName,
            color: c,
            usedDays: item.days,
            lastUsedAt: ts,
            entries: [{ id: item.id, period: s, days: item.days, startAt: ts }],
          });
          continue;
        }
        prev.usedDays += item.days;
        if (ts > prev.lastUsedAt) prev.lastUsedAt = ts;
        prev.entries.push({ id: item.id, period: s, days: item.days, startAt: ts });
      }
    }
    return [...map.values()]
      .map((row) => ({
        ...row,
        entries: row.entries.sort((a, b) => b.startAt - a.startAt),
      }))
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }, [requests]);

  const filteredRows = selectedKey === "ALL" ? rows : rows.filter((r) => r.key === selectedKey);

  if (rows.length === 0) {
    return <div className="panel-body text-center py-10 text-gray-400 text-sm">승인 완료된 휴가 사용 내역이 없습니다.</div>;
  }

  return (
    <div className="space-y-3 p-3 md:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">최근 사용된 휴가 유형 순서로 정렬됩니다.</p>
        <select
          className="h-9 rounded-md border border-gray-300 px-2 text-sm bg-white"
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
        >
          <option value="ALL">전체</option>
          {rows.map((row) => (
            <option key={row.key} value={row.key}>
              {row.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3">
        {filteredRows.map((row) => (
          <div key={row.key} className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <p className="font-semibold" style={{ color: row.color }}>
                {row.label}
              </p>
              <p className="text-sm text-slate-700 font-semibold tabular-nums">총 {row.usedDays.toFixed(1)}일</p>
            </div>
            <ul className="px-4 py-3 space-y-1.5">
              {row.entries.slice(0, 8).map((e) => (
                <li key={e.id} className="text-sm text-gray-700 flex items-center justify-between gap-3">
                  <span className="text-gray-500">{e.period}</span>
                  <span className="tabular-nums font-medium">{e.days.toFixed(1)}일</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

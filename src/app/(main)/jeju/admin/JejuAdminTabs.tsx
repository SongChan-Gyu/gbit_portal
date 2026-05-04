"use client";

import { useState } from "react";
import JejuSettingsTab from "@/app/(main)/admin/leave-management/JejuSettingsTab";
import JejuManualEntryTab from "./JejuManualEntryTab";
import JejuBulkImportTab from "./JejuBulkImportTab";

type EmpOption = {
  id: string;
  name: string;
  empNo: string;
  teamName: string | null;
  employeeType: string;
  status: string;
};

type Tab = "settings" | "manual" | "bulk";

export default function JejuAdminTabs({ employees }: { employees: EmpOption[] }) {
  const [tab, setTab] = useState<Tab>("settings");

  const tabs: { key: Tab; label: string; sub?: string; active: string; inactive: string }[] = [
    {
      key: "settings",
      label: "설정",
      active: "border-blue-600 text-blue-700 bg-blue-50/60",
      inactive: "border-transparent text-gray-500 hover:text-gray-700",
    },
    {
      key: "manual",
      label: "수동 등록",
      sub: "(이관)",
      active: "border-amber-500 text-amber-700 bg-amber-50/60",
      inactive: "border-transparent text-gray-500 hover:text-gray-700",
    },
    {
      key: "bulk",
      label: "엑셀 일괄 등록",
      sub: "(이관)",
      active: "border-green-600 text-green-700 bg-green-50/60",
      inactive: "border-transparent text-gray-500 hover:text-gray-700",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              tab === t.key ? t.active : t.inactive
            }`}
          >
            {t.label}
            {t.sub && <span className="ml-1 text-xs text-gray-400">{t.sub}</span>}
          </button>
        ))}
      </div>

      {tab === "settings" && <JejuSettingsTab />}
      {tab === "manual" && <JejuManualEntryTab employees={employees} />}
      {tab === "bulk" && <JejuBulkImportTab />}
    </div>
  );
}

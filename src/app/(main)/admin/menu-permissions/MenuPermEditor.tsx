"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Check, ChevronDown, ChevronRight } from "lucide-react";
import type { MenuDef } from "@/lib/menuConfig";
import { ICON_MAP, SECTION_LABEL_LONG } from "@/lib/menuIcons";

const ROLE_LABELS: Record<string, string> = {
  STAFF: "팀원", TEAM_LEAD: "팀장", PM: "PM", ADMIN: "관리자",
};
const ROLE_COLORS: Record<string, string> = {
  STAFF: "bg-gray-100 text-gray-700",
  TEAM_LEAD: "bg-blue-100 text-blue-700",
  PM: "bg-purple-100 text-purple-700",
  ADMIN: "bg-red-100 text-red-700",
};
const SECTION_COLOR: Record<string, string> = {
  main:  "bg-blue-50  border-blue-200  text-blue-800",
  admin: "bg-amber-50 border-amber-200 text-amber-800",
  dev:   "bg-gray-50  border-gray-200  text-gray-600",
};

export default function MenuPermEditor({
  menus, perms: initial, roles,
}: { menus: MenuDef[]; perms: Record<string, string[]>; roles: string[] }) {
  const router = useRouter();
  const [perms, setPerms] = useState<Record<string, string[]>>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  function toggle(role: string, key: string) {
    setPerms((prev) => {
      const cur = prev[role] ?? [];
      return { ...prev, [role]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] };
    });
    setSaved(false);
  }

  function setAll(role: string, keys: string[], enable: boolean) {
    setPerms((prev) => {
      const cur = new Set(prev[role] ?? []);
      if (enable) keys.forEach((k) => cur.add(k));
      else keys.forEach((k) => cur.delete(k));
      return { ...prev, [role]: Array.from(cur) };
    });
    setSaved(false);
  }

  function setAllRoles(key: string, enable: boolean) {
    setPerms((prev) => {
      const next = { ...prev };
      for (const role of roles) {
        const cur = new Set(next[role] ?? []);
        if (enable) cur.add(key); else cur.delete(key);
        next[role] = Array.from(cur);
      }
      return next;
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true); setSaved(false);
    await fetch("/api/admin/menu-permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(perms),
    });
    setSaving(false); setSaved(true);
    router.refresh();
  }

  const sections = ["main", "admin", "dev"] as const;

  return (
    <div className="space-y-4">
      {/* 역할 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {roles.map((role) => {
          const count = (perms[role] ?? []).length;
          const total = menus.length;
          return (
            <div key={role} className="card py-3 px-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[role]}`}>
                  {ROLE_LABELS[role]}
                </span>
                <span className="text-xs text-gray-400">{count}/{total}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${(count / total) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 섹션별 테이블 */}
      {sections.map((sec) => {
        const secMenus = menus.filter((m) => m.section === sec);
        if (secMenus.length === 0) return null;
        const isCollapsed = collapsed[sec];
        const secKeys = secMenus.map((m) => m.key);

        return (
          <div key={sec} className="card p-0 overflow-hidden">
            {/* 섹션 헤더 */}
            <button
              type="button"
              onClick={() => setCollapsed((p) => ({ ...p, [sec]: !p[sec] }))}
              className={`w-full flex items-center justify-between px-5 py-3.5 border-b border-gray-100 ${SECTION_COLOR[sec]} hover:opacity-90 transition-opacity`}>
              <div className="flex items-center gap-2">
                {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                <span className="text-sm font-semibold">{SECTION_LABEL_LONG[sec]}</span>
                <span className="text-xs opacity-60">{secMenus.length}개</span>
              </div>
              <div className="flex gap-2">
                {roles.map((role) => {
                  const enabledCount = secKeys.filter((k) => (perms[role] ?? []).includes(k)).length;
                  return (
                    <span key={role} className="text-[11px] font-medium">
                      {ROLE_LABELS[role]} {enabledCount}/{secMenus.length}
                    </span>
                  );
                })}
              </div>
            </button>

            {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[580px]">
                  <thead className="border-b border-gray-100">
                    <tr className="bg-gray-50">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 w-52">메뉴</th>
                      {/* 전체 열: 모든 역할 동시 켜기/끄기 */}
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-400 w-16">전체</th>
                      {roles.map((role) => (
                        <th key={role} className="px-3 py-2.5 text-center text-xs font-semibold w-24">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_COLORS[role]}`}>
                              {ROLE_LABELS[role]}
                            </span>
                            <button
                              onClick={() => {
                                const allEnabled = secKeys.every((k) => (perms[role] ?? []).includes(k));
                                setAll(role, secKeys, !allEnabled);
                              }}
                              className="text-[10px] text-gray-400 hover:text-gray-600 underline">
                              {secKeys.every((k) => (perms[role] ?? []).includes(k)) ? "모두 끄기" : "모두 켜기"}
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {secMenus.map((menu) => {
                      const allOn = roles.every((r) => (perms[r] ?? []).includes(menu.key));
                      return (
                        <tr key={menu.key} className="hover:bg-gray-50 transition-colors">
                          {/* 메뉴 (사이드바와 동일한 아이콘·라벨) */}
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              {(() => {
                                const Icon = ICON_MAP[menu.key];
                                return Icon ? (
                                  <Icon size={15} className="text-gray-500 shrink-0" />
                                ) : (
                                  <span className="text-base leading-none w-[15px] shrink-0">•</span>
                                );
                              })()}
                              <div className="min-w-0">
                                <p className="text-[13px] font-medium text-gray-800">{menu.label}</p>
                                <p className="text-[11px] text-gray-400 font-mono truncate">{menu.href}</p>
                              </div>
                            </div>
                          </td>
                          {/* 전체 켜기/끄기 */}
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => setAllRoles(menu.key, !allOn)}
                              className={`w-5 h-5 rounded flex items-center justify-center text-xs border transition-all ${
                                allOn
                                  ? "bg-blue-500 border-blue-500 text-white"
                                  : "bg-white border-gray-300 text-transparent hover:border-gray-400"
                              }`}
                              title="모든 역할 동시 토글">
                              <Check size={11} />
                            </button>
                          </td>
                          {/* 역할별 토글 */}
                          {roles.map((role) => {
                            const enabled = (perms[role] ?? []).includes(menu.key);
                            return (
                              <td key={role} className="px-3 py-3 text-center">
                                <button
                                  onClick={() => toggle(role, menu.key)}
                                  className={`relative inline-flex w-10 h-5 rounded-full transition-colors focus:outline-none ${
                                    enabled ? "bg-blue-500" : "bg-gray-200"
                                  }`}
                                  title={enabled ? "비활성화" : "활성화"}>
                                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                                    enabled ? "translate-x-5" : "translate-x-0.5"
                                  }`} />
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* 저장 */}
      <div className="flex items-center gap-4 pt-2">
        <button onClick={save} disabled={saving}
          className="btn-primary px-8 flex items-center gap-2">
          {saving
            ? <><span className="spinner" /><span>저장 중…</span></>
            : <><Save size={15} /><span>변경사항 저장</span></>}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
            <Check size={14} /> 저장되었습니다
          </span>
        )}
      </div>
    </div>
  );
}

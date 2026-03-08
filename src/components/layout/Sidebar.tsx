"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { MENU_GROUPS } from "@/lib/menuConfig";
import { ICON_MAP, SECTION_LABEL, DEFAULT_MENU_ICON } from "@/lib/menuIcons";

export default function Sidebar({
  allowedMenuKeys,
  onClose,
}: { allowedMenuKeys?: string[]; onClose?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as any;

  const allowed = useMemo(() => {
    if (allowedMenuKeys?.length) return new Set(allowedMenuKeys);
    const allKeys = MENU_GROUPS.flatMap((g) => (g.href ? [g.key] : g.children?.map((c) => c.key) ?? []));
    return new Set(allKeys);
  }, [allowedMenuKeys]);

  const visibleGroups = useMemo(() => {
    return MENU_GROUPS.filter((g) => {
      if (g.href) return allowed.has(g.key);
      if (g.children) return g.children.some((c) => allowed.has(c.key));
      return false;
    });
  }, [allowed]);

  const expandedByPath = useMemo(() => {
    const key = visibleGroups.find((g) => {
      if (g.children) return g.children.some((c) => pathname === c.href || (c.href !== "/dashboard" && pathname.startsWith(c.href)));
      return false;
    });
    return key?.key ?? null;
  }, [pathname, visibleGroups]);

  const [expanded, setExpanded] = useState<string | null>(expandedByPath);

  useEffect(() => {
    if (expandedByPath) setExpanded(expandedByPath);
  }, [expandedByPath]);

  const isOpen = (groupKey: string) => expanded === groupKey || expandedByPath === groupKey;

  const sections = ["main", "admin", "dev"] as const;

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  }

  return (
    <div className="flex flex-col h-full bg-white text-sm">
      <div className="px-4 py-3.5 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-blue-700 rounded flex items-center justify-center text-white font-black text-sm tracking-tight">
            GBIT
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">GBIT Portal</p>
            <p className="text-xs text-gray-400 leading-tight">{user?.name}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map((sec) => {
          const groups = visibleGroups.filter((g) => g.section === sec);
          if (groups.length === 0) return null;
          return (
            <div key={sec}>
              {SECTION_LABEL[sec] && (
                <p className="section-divider">{SECTION_LABEL[sec]}</p>
              )}
              {groups.map((group) => {
                const Icon = ICON_MAP[group.key] ?? DEFAULT_MENU_ICON;
                if (group.href) {
                  const active = isActive(group.href);
                  return (
                    <Link key={group.key} href={group.href} onClick={onClose}
                      className={`flex items-center gap-2.5 mx-2 px-3 py-2.5 rounded mb-0.5 transition-colors text-sm ${
                        active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}>
                      <Icon size={17} className={active ? "text-blue-600" : "text-gray-400"} />
                      <span className="flex-1">{group.label}</span>
                      {active && <ChevronRight size={14} className="text-blue-400" />}
                    </Link>
                  );
                }
                if (!group.children?.length) return null;
                const allowedChildren = group.children.filter((c) => allowed.has(c.key));
                if (allowedChildren.length === 0) return null;
                const open = isOpen(group.key);
                return (
                  <div key={group.key} className="mb-0.5">
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => (p === group.key ? null : group.key))}
                      className="flex items-center gap-2.5 mx-2 px-3 py-2.5 rounded w-full text-left transition-colors text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    >
                      <Icon size={17} className="text-gray-400" />
                      <span className="flex-1">{group.label}</span>
                      {open ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                    </button>
                    {open && (
                      <div className="ml-4 pl-2 border-l border-gray-100 space-y-0.5">
                        {allowedChildren.map((c) => {
                          const active = isActive(c.href);
                          return (
                            <Link key={c.key} href={c.href} onClick={onClose}
                              className={`flex items-center gap-2 px-2.5 py-2 rounded text-sm transition-colors ${
                                active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                              }`}>
                              <span className="flex-1">{c.label}</span>
                              {active && <ChevronRight size={12} className="text-blue-400" />}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-400">
          {user?.name} · {(user?.role === "STAFF" ? "팀원" : user?.role === "TEAM_LEAD" ? "팀장" : user?.role)}
        </p>
      </div>
    </div>
  );
}

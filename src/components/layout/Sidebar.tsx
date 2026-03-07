"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronRight } from "lucide-react";
import { ALL_MENUS } from "@/lib/menuConfig";
import { ICON_MAP, SECTION_LABEL, DEFAULT_MENU_ICON } from "@/lib/menuIcons";

export default function Sidebar({
  allowedMenuKeys,
  onClose,
}: { allowedMenuKeys?: string[]; onClose?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as any;

  const allowed = new Set(allowedMenuKeys ?? ALL_MENUS.map((m) => m.key));
  const visible  = ALL_MENUS.filter((m) => allowed.has(m.key));

  const sections = ["main","admin","dev"] as const;

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  }

  return (
    <div className="flex flex-col h-full bg-white text-[13px]">
      {/* 로고 영역 */}
      <div className="px-4 py-3.5 border-b border-gray-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-700 rounded flex items-center justify-center text-white font-black text-xs tracking-tight">
            HRM
          </div>
          <div>
            <p className="font-bold text-gray-900 text-[13px] leading-tight">인사관리 시스템</p>
            <p className="text-[11px] text-gray-400 leading-tight">{user?.name}</p>
          </div>
        </div>
      </div>

      {/* 내비게이션 */}
      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map((sec) => {
          const items = visible.filter((m) => m.section === sec);
          if (items.length === 0) return null;
          return (
            <div key={sec}>
              {SECTION_LABEL[sec] && (
                <p className="section-divider">{SECTION_LABEL[sec]}</p>
              )}
              {items.map((item) => {
                const Icon = ICON_MAP[item.key] ?? DEFAULT_MENU_ICON;
                const active = isActive(item.href);
                return (
                  <Link key={item.key} href={item.href} onClick={onClose}
                    className={`flex items-center gap-2.5 mx-2 px-3 py-2 rounded mb-0.5 transition-colors ${
                      active
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}>
                    <Icon size={15} className={active ? "text-blue-600" : "text-gray-400"} />
                    <span className="flex-1">{item.label}</span>
                    {active && <ChevronRight size={12} className="text-blue-400" />}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* 하단 사용자 정보 */}
      <div className="border-t border-gray-200 px-4 py-3">
        <p className="text-[11px] text-gray-400">
          {user?.name} · {(user?.role === "STAFF" ? "팀원" : user?.role === "TEAM_LEAD" ? "팀장" : user?.role)}
        </p>
      </div>
    </div>
  );
}

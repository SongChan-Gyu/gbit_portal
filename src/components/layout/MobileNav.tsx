"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/types";

interface NavItem { href: string; label: string; roles: Role[]; }

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "대시보드", roles: ["STAFF","TEAM_LEAD","PM","ADMIN"] },
  { href: "/leave/apply", label: "휴가 신청", roles: ["STAFF","TEAM_LEAD","PM","ADMIN"] },
  { href: "/leave/my", label: "내 휴가 현황", roles: ["STAFF","TEAM_LEAD","PM","ADMIN"] },
  { href: "/leave/approve", label: "결재함", roles: ["TEAM_LEAD","PM","ADMIN"] },
  { href: "/attendance", label: "월별 근태 현황", roles: ["STAFF","TEAM_LEAD","PM","ADMIN"] },
  { href: "/stamp", label: "스탬프 쿠폰", roles: ["STAFF","TEAM_LEAD","PM","ADMIN"] },
  { href: "/admin/employees", label: "사원 관리", roles: ["ADMIN"] },
  { href: "/admin/leave-types", label: "휴가유형 관리", roles: ["ADMIN"] },
  { href: "/admin/teams", label: "팀 관리", roles: ["ADMIN"] },
  { href: "/admin/leave-grant", label: "연차 부여/이월", roles: ["ADMIN"] },
  { href: "/admin/leave-management", label: "휴가 부여·현황", roles: ["ADMIN"] },
];

export default function MobileNav({
  open, onClose, role,
}: { open: boolean; onClose: () => void; role: Role }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((n) => n.roles.includes(role));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-[min(280px,85vw)] bg-slate-800 flex flex-col">
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-700">
          <span className="font-bold text-white text-[17px]">GBIT Portal</span>
          <button type="button" onClick={onClose} className="p-2 -m-2 text-slate-400 hover:text-white touch-manipulation" aria-label="메뉴 닫기">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} onClick={onClose}
                className={`flex items-center px-4 py-4 rounded-xl text-[16px] font-medium transition-colors touch-manipulation min-h-[48px] ${
                  active ? "bg-slate-600 text-white" : "text-slate-300 hover:bg-slate-700 hover:text-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

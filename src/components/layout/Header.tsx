"use client";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import NotificationBell from "./NotificationBell";

const ROLE_LABEL: Record<string, string> = {
  STAFF: "팀원", TEAM_LEAD: "팀장", PM: "PM", ADMIN: "관리자",
};

export default function Header({ allowedMenuKeys }: { allowedMenuKeys?: string[] }) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="bg-white border-b border-gray-200 px-4 flex items-center justify-between h-12 shrink-0">
        <div className="flex items-center gap-3">
          <button
            className="md:hidden p-3 -m-1 min-w-[44px] min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center text-gray-600 touch-manipulation"
            onClick={() => setOpen(true)}
            aria-label="메뉴 열기"
          >
            <Menu size={22} />
          </button>
          {/* 빵부스러기 없음 — 직접 타이틀 렌더 안 함 */}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 pr-3 border-r border-gray-200">
            <div className="w-7 h-7 rounded-full bg-blue-700 text-white text-xs font-bold flex items-center justify-center">
              {user?.name?.charAt(0) ?? "?"}
            </div>
            <div className="leading-tight">
              <p className="text-[13px] font-semibold text-gray-800">{user?.name}</p>
              <p className="text-[11px] text-gray-400">{ROLE_LABEL[user?.role ?? "STAFF"]}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: typeof window !== "undefined" ? `${window.location.origin}/login` : "/login" })}
            className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-red-600 hover:bg-red-50 active:bg-red-100 min-h-[44px] min-w-[44px] md:min-w-0 px-3 py-2 rounded-lg transition-colors touch-manipulation"
            aria-label="로그아웃"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </div>
      </header>

      {/* 모바일 드로어 */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 h-12 border-b border-gray-200 shrink-0">
              <span className="font-semibold text-gray-800 text-[13px]">메뉴</span>
              <button
                onClick={() => setOpen(false)}
                className="p-3 -m-1 min-w-[44px] min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center touch-manipulation"
                aria-label="메뉴 닫기"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Sidebar allowedMenuKeys={allowedMenuKeys} onClose={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

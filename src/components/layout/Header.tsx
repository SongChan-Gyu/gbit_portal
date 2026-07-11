"use client";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { LogOut, Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import NotificationBell from "./NotificationBell";
import { clearLoginAnnouncementSessionDismissals } from "@/lib/loginAnnouncementSession";

const ROLE_LABEL: Record<string, string> = {
  STAFF: "팀원", TEAM_LEAD: "팀장", PM: "PM", ADMIN: "관리자",
};

export default function Header({ allowedMenuKeys }: { allowedMenuKeys?: string[] }) {
  const { data: session } = useSession();
  const user = session?.user as any;
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  /** overflow:hidden 조상 때문에 fixed 레이어가 전체 화면·클릭을 가리는 문제 방지 + 데스크톱에서 메뉴 상태 정리 */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      if (mq.matches) setOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // 모바일 드로어 열림: 본문(main)·body 스크롤 잠금 — 뒤 콘텐츠가 밀리거나 같이 스크롤되는 현상 완화
  useEffect(() => {
    if (!open) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const main = document.querySelector("main");
    const prevMainOverflow = main?.style.overflow ?? "";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    if (main) main.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      if (main) main.style.overflow = prevMainOverflow;
    };
  }, [open]);

  async function handleSignOut() {
    clearLoginAnnouncementSessionDismissals();
    try {
      await signOut({ callbackUrl: "/login", redirect: false });
    } catch {
      /* 응답 형식 오류 등 — 아래에서 전체 이동으로 정리 */
    }
    window.location.replace("/login");
  }

  return (
    <>
      <header className="bg-white border-b border-gray-200 px-4 flex items-center justify-between h-12 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
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
          <NotificationBell />
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-red-600 hover:bg-red-50 active:bg-red-100 min-h-[44px] min-w-[44px] md:min-w-0 px-3 py-2 rounded-lg transition-colors touch-manipulation"
            aria-label="로그아웃"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </div>
      </header>

      {/* 모바일 드로어: body로 포털 — 레이아웃 overflow:hidden 안에 두면 클릭/레이어가 어긋나는 경우 방지 */}
      {portalReady &&
        open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] md:hidden max-w-[100vw] overflow-hidden overscroll-none"
            role="dialog"
            aria-modal="true"
            aria-label="모바일 메뉴"
          >
            <div
              className="absolute inset-0 bg-black/40 touch-none"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="absolute left-0 top-0 h-full w-[min(18rem,85vw)] max-w-[85vw] bg-white shadow-2xl flex flex-col pointer-events-auto touch-pan-y overscroll-y-contain [overscroll-behavior-x:contain]">
              <div className="flex items-center justify-between px-4 h-12 border-b border-gray-200 shrink-0 touch-none">
                <span className="font-semibold text-gray-800 text-[13px]">메뉴</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-3 -m-1 min-w-[44px] min-h-[44px] rounded-lg hover:bg-gray-100 active:bg-gray-200 flex items-center justify-center touch-manipulation"
                  aria-label="메뉴 닫기"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden touch-pan-y overscroll-y-contain [-webkit-overflow-scrolling:touch]">
                <Sidebar allowedMenuKeys={allowedMenuKeys} onClose={() => setOpen(false)} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

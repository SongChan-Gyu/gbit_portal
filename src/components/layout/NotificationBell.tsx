"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, BellRing, Check, CheckCheck, ChevronRight, X,
  CalendarCheck, CalendarX, Star, AlertCircle, Info,
} from "lucide-react";
import { formatDistanceToNow } from "@/lib/dateUtils";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  LEAVE_REQUEST:        CalendarCheck,
  LEAVE_APPROVED:       CalendarCheck,
  LEAVE_REJECTED:       CalendarX,
  LEAVE_CANCEL_REQUEST: AlertCircle,
  LEAVE_CANCELED:       CalendarX,
  STAMP_REQUEST:        Star,
  STAMP_APPROVED:       Star,
  STAMP_REJECTED:       Star,
  SYSTEM:               Info,
};

const TYPE_COLOR: Record<string, string> = {
  LEAVE_REQUEST:        "bg-blue-100 text-blue-600",
  LEAVE_APPROVED:       "bg-green-100 text-green-600",
  LEAVE_REJECTED:       "bg-red-100 text-red-600",
  LEAVE_CANCEL_REQUEST: "bg-amber-100 text-amber-600",
  LEAVE_CANCELED:       "bg-gray-100 text-gray-500",
  STAMP_REQUEST:        "bg-purple-100 text-purple-600",
  STAMP_APPROVED:       "bg-green-100 text-green-600",
  STAMP_REJECTED:       "bg-red-100 text-red-600",
  SYSTEM:               "bg-gray-100 text-gray-500",
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=15");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 주기적 폴링 (30초)
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // 패널 열 때 새로고침
  function handleToggle() {
    if (!open) fetchNotifications();
    setOpen((p) => !p);
  }

  async function markRead(ids: string[]) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - ids.length));
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  function handleItemClick(n: Notification) {
    if (!n.isRead) markRead([n.id]);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* 벨 버튼 */}
      <button
        onClick={handleToggle}
        className={`relative flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
          open ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        }`}
        aria-label="알림">
        {unreadCount > 0 ? <BellRing size={17} /> : <Bell size={17} />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* 드롭다운 패널 */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <BellRing size={15} className="text-gray-600" />
              <span className="text-[13px] font-bold text-gray-800">알림</span>
              {unreadCount > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors font-medium">
                  <CheckCheck size={12} />
                  모두 읽음
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-200 text-gray-400">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 알림 목록 */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-gray-400">
                <div className="inline-block w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2" />
                <p>불러오는 중...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 text-center">
                <Bell size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-400 font-medium">알림이 없습니다</p>
                <p className="text-[11px] text-gray-300 mt-0.5">새로운 알림이 오면 여기에 표시됩니다</p>
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Info;
                const colorClass = TYPE_COLOR[n.type] ?? "bg-gray-100 text-gray-500";
                return (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${
                      !n.isRead ? "bg-blue-50/40" : ""
                    }`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${colorClass}`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-[12px] font-semibold leading-tight ${!n.isRead ? "text-gray-900" : "text-gray-600"}`}>
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-gray-400 mt-1.5">
                        {formatDistanceToNow(n.createdAt)}
                      </p>
                    </div>
                    {n.link && (
                      <ChevronRight size={13} className="text-gray-300 shrink-0 mt-1" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* 하단 */}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
            <button
              onClick={() => { setOpen(false); router.push("/notifications"); }}
              className="w-full text-center text-[12px] text-blue-600 hover:text-blue-700 font-medium py-1 rounded hover:bg-blue-50 transition-colors">
              알림 전체 보기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

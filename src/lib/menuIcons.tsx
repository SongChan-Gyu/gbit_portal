/**
 * 사이드바·메뉴권한 화면 공통: 아이콘 매핑 및 섹션 라벨
 */
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Megaphone,
  User,
  CalendarPlus,
  CalendarCheck,
  CheckSquare,
  BookOpen,
  ClipboardList,
  Stamp,
  Users,
  CalendarRange,
  CalendarClock,
  Settings2,
  Wrench,
  UserRoundCog,
  Home,
} from "lucide-react";

/** 메뉴 키에 매핑이 없을 때 사용 (사이드바 등) */
export const DEFAULT_MENU_ICON = LayoutDashboard;

export const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  me: User,
  notices: Megaphone,
  leave: CalendarPlus,
  leave_apply: CalendarPlus,
  leave_my: CalendarCheck,
  leave_approve: CheckSquare,
  leave_policy: BookOpen,
  attendance: ClipboardList,
  stamp: Stamp,
  jeju: Home,
  admin: Settings2,
  admin_organization: Users,
  admin_leave_settings: CalendarRange,
  admin_leave_mgmt: CalendarClock,
  admin_system: Settings2,
  dev: Wrench,
  test_user_switch: UserRoundCog,
};

/** 사이드바용 섹션 라벨 (main은 빈 문자열) */
export const SECTION_LABEL: Record<string, string> = {
  main: "",
  admin: "관리",
  dev: "테스트",
};

/** 메뉴권한 관리 화면용 섹션 라벨 */
export const SECTION_LABEL_LONG: Record<string, string> = {
  main: "일반 메뉴",
  admin: "관리 메뉴",
  dev: "테스트 메뉴",
};

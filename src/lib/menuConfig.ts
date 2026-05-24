/**
 * 메뉴 마스터 - 대메뉴/소메뉴 구조
 */
export interface MenuItemDef {
  key: string;
  label: string;
  href: string;
}

export interface MenuGroupDef {
  key: string;
  label: string;
  icon: string;
  section: "main" | "admin" | "dev";
  href?: string;
  children?: MenuItemDef[];
}

/** 단일 메뉴는 href만, 그룹은 children만 */
export const MENU_GROUPS: MenuGroupDef[] = [
  { key: "dashboard", label: "대시보드", icon: "🏠", href: "/dashboard", section: "main" },
  { key: "me", label: "내 정보", icon: "👤", href: "/me", section: "main" },
  { key: "notices", label: "공지사항", icon: "📌", href: "/notices", section: "main" },
  {
    key: "leave",
    label: "휴가",
    icon: "📝",
    section: "main",
    children: [
      { key: "leave_apply", label: "휴가 신청", href: "/leave/apply" },
      { key: "leave_my", label: "내 휴가 현황", href: "/leave/my" },
      { key: "leave_approve", label: "결재함", href: "/leave/approve" },
      { key: "attendance", label: "월별 근태 현황", href: "/attendance" },
      { key: "stamp", label: "스탬프 쿠폰", href: "/stamp" },
      { key: "leave_policy", label: "휴가 규정", href: "/leave/policy" },
    ],
  },
  {
    key: "jeju",
    label: "제주도 숙소",
    icon: "🏝️",
    section: "main",
    children: [
      { key: "jeju", label: "예약하기", href: "/jeju" },
      { key: "jeju_my", label: "예약 신청 내역", href: "/jeju/my" },
      { key: "jeju_approve", label: "결재함", href: "/jeju/approve" },
      { key: "jeju_info", label: "숙소 정보", href: "/jeju/info" },
      { key: "jeju_admin", label: "숙소 관리", href: "/jeju/admin" },
    ],
  },
  {
    key: "collab",
    label: "소통",
    icon: "💬",
    section: "main",
    children: [
      { key: "improvement_board", label: "개선·협의 게시판", href: "/improvement" },
      { key: "support_inbox", label: "1:1 문의", href: "/support" },
    ],
  },
  {
    key: "admin",
    label: "관리",
    icon: "⚙️",
    section: "admin",
    children: [
      { key: "admin_organization", label: "인사 관리", href: "/admin/organization" },
      { key: "admin_leave_settings", label: "휴가 유형 설정", href: "/admin/leave-settings" },
      { key: "admin_leave_mgmt", label: "휴가 부여·현황", href: "/admin/leave-management" },
      { key: "admin_forms", label: "유동 양식 관리", href: "/admin/forms" },
      { key: "admin_employee_groups", label: "그룹 설정", href: "/admin/groups" },
      { key: "admin_login_announcements", label: "로그인 팝업", href: "/admin/login-announcements" },
      { key: "admin_notices", label: "공지사항 관리", href: "/admin/notices" },
      { key: "admin_system", label: "시스템 설정", href: "/admin/system" },
    ],
  },
  {
    key: "dev",
    label: "테스트",
    icon: "🔧",
    section: "dev",
    children: [
      { key: "test_user_switch", label: "사용자 전환", href: "/test/user-switch" },
    ],
  },
];

/** 권한 체크용: 모든 메뉴 키 (단일 + 그룹 내 자식) */
function collectAllKeys(): string[] {
  const keys: string[] = [];
  for (const g of MENU_GROUPS) {
    if (g.href) keys.push(g.key);
    if (g.children) for (const c of g.children) keys.push(c.key);
  }
  return keys;
}

export const ALL_MENU_KEYS = collectAllKeys();

/** 역할별 기본 메뉴 권한 */
export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  STAFF: [
    "dashboard", "me", "notices",
    "improvement_board", "support_inbox",
    "leave_apply", "leave_my", "leave_approve", "leave_policy",
    "attendance", "stamp",
    "jeju", "jeju_my", "jeju_info",
  ],
  TEAM_LEAD: [
    "dashboard", "me", "notices",
    "improvement_board", "support_inbox",
    "leave_apply", "leave_my", "leave_approve", "leave_policy",
    "attendance", "stamp",
    "jeju", "jeju_my", "jeju_info",
  ],
  PM: ALL_MENU_KEYS,
  ADMIN: ALL_MENU_KEYS,
};

/** 메뉴 권한 편집 화면용: 플랫 리스트 (기존 ALL_MENUS 호환) */
export interface MenuDef {
  key: string;
  label: string;
  icon: string;
  href: string;
  section: "main" | "admin" | "dev";
}

export function getAllMenusFlat(): MenuDef[] {
  const list: MenuDef[] = [];
  for (const g of MENU_GROUPS) {
    if (g.href) {
      list.push({ key: g.key, label: g.label, icon: g.icon, href: g.href, section: g.section });
    }
    if (g.children) {
      for (const c of g.children) {
        list.push({ key: c.key, label: c.label, icon: g.icon, href: c.href, section: g.section });
      }
    }
  }
  return list;
}

export const ALL_MENUS = getAllMenusFlat();

/**
 * 메뉴 마스터 정의 - 추가/제거는 여기에서
 */
export interface MenuDef {
  key: string;
  label: string;
  icon: string;
  href: string;
  section: "main" | "admin" | "dev";
}

export const ALL_MENUS: MenuDef[] = [
  // main
  { key:"dashboard",        label:"대시보드",     icon:"🏠", href:"/dashboard",         section:"main" },
  { key:"leave_apply",      label:"휴가 신청",    icon:"📝", href:"/leave/apply",       section:"main" },
  { key:"leave_my",         label:"내 휴가 현황", icon:"📊", href:"/leave/my",          section:"main" },
  { key:"leave_approve",    label:"결재함",       icon:"✅", href:"/leave/approve",     section:"main" },
  { key:"leave_policy",     label:"휴가 규정",    icon:"📖", href:"/leave/policy",      section:"main" },
  { key:"attendance",       label:"근태 현황",    icon:"📅", href:"/attendance",         section:"main" },
  { key:"stamp",            label:"스탬프 쿠폰",  icon:"⭐", href:"/stamp",             section:"main" },
  { key:"jeju",             label:"제주도 숙소",  icon:"🏝️", href:"/jeju",              section:"main" },
  // admin
  { key:"admin_organization",   label:"인사 관리",   icon:"👥", href:"/admin/organization",    section:"admin" },
  { key:"admin_leave_settings", label:"휴가 설정",   icon:"📋", href:"/admin/leave-settings",  section:"admin" },
  { key:"admin_leave_mgmt",     label:"휴가 관리",   icon:"🗓️", href:"/admin/leave-management", section:"admin" },
  { key:"admin_system",         label:"시스템 설정", icon:"⚙️", href:"/admin/system",           section:"admin" },
  // dev
  { key:"test_impersonate", label:"결재 테스트",  icon:"🔧", href:"/test/impersonate",  section:"dev" },
  { key:"test_user_switch", label:"사용자 전환",  icon:"👤", href:"/test/user-switch",  section:"dev" },
];

export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  STAFF:     ["dashboard","leave_apply","leave_my","leave_policy","attendance","stamp","jeju"],
  TEAM_LEAD: ["dashboard","leave_apply","leave_my","leave_approve","leave_policy","attendance","stamp","jeju"],
  PM:        ["dashboard","leave_apply","leave_my","leave_approve","leave_policy","attendance","stamp","jeju",
               "admin_organization","admin_leave_settings","admin_leave_mgmt","admin_system",
               "test_impersonate","test_user_switch"],
  ADMIN:     ALL_MENUS.map((m) => m.key),
};

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import ImpersonationBanner from "@/components/layout/ImpersonationBanner";
import prisma from "@/lib/db";
import { DEFAULT_PERMISSIONS } from "@/lib/menuConfig";
import { isWelfareDept } from "@/lib/jeju";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as any;

  // DB에서 메뉴 권한 로드 (없으면 기본값)
  const config = await prisma.systemConfig.findUnique({ where:{ key:"menuPermissions" } });
  const allPerms: Record<string, string[]> = config
    ? JSON.parse(config.value)
    : DEFAULT_PERMISSIONS;
  let allowedMenuKeys: string[] = allPerms[user.role] ?? DEFAULT_PERMISSIONS[user.role] ?? [];

  // 외부개발자: 휴가/스탬프/근태 미관리, 제주 숙소만 사용
  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true, employeeType: true },
  });
  const isExternal = employee?.employeeType === "EXTERNAL";
  if (isExternal) {
    allowedMenuKeys = ["dashboard", "notices", "jeju", "jeju_my", "jeju_info"];
  } else if (isWelfareDept(employee)) {
    if (!allowedMenuKeys.includes("jeju_admin")) allowedMenuKeys = [...allowedMenuKeys, "jeju_admin"];
    if (!allowedMenuKeys.includes("jeju_approve")) allowedMenuKeys = [...allowedMenuKeys, "jeju_approve"];
  }

  // 포털 메뉴 노출 양식: showInMenu=true, isActive=true, audience 매칭
  const formMenuItems = await prisma.form.findMany({
    where: {
      showInMenu: true,
      isActive: true,
      OR: [
        { audience: "ALL" },
        { audience: isExternal ? "EXTERNAL" : "INTERNAL" },
      ],
    },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <SessionProvider session={session}>
      {/* 상단: 전환 배너(있을 때) + 본문 영역; 배너는 문서 흐름이라 메뉴를 덮지 않음 */}
      <div className="flex flex-col h-[100dvh] min-h-0 max-w-[100vw] overflow-hidden overflow-x-hidden bg-gray-50">
        <ImpersonationBanner />
        <div className="flex flex-1 min-h-0 max-w-full overflow-hidden overflow-x-hidden">
          {/* 사이드바 - 데스크톱 */}
          <aside className="hidden md:flex flex-col w-64 lg:w-72 shrink-0 bg-white border-r border-gray-100 overflow-y-auto overflow-x-hidden overscroll-contain touch-pan-y">
            <Sidebar allowedMenuKeys={allowedMenuKeys} formMenuItems={formMenuItems} />
          </aside>
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <Header allowedMenuKeys={allowedMenuKeys} formMenuItems={formMenuItems} />
            <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain safe-area-bottom">
              <div className="px-4 py-5 md:px-6 md:py-6 pb-10 md:pb-6 max-w-5xl mx-auto w-full min-w-0">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
}

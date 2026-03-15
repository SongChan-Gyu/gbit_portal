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

  // 제주 숙소 관리: 복지부(dutyDept)도 노출 (역할이 STAFF/TEAM_LEAD여도)
  const employee = await prisma.employee.findUnique({
    where: { id: user.employeeId },
    select: { dutyDept: true },
  });
  if (isWelfareDept(employee)) {
    if (!allowedMenuKeys.includes("jeju_admin")) allowedMenuKeys = [...allowedMenuKeys, "jeju_admin"];
    if (!allowedMenuKeys.includes("jeju_approve")) allowedMenuKeys = [...allowedMenuKeys, "jeju_approve"];
  }

  return (
    <SessionProvider session={session}>
      {/* 상단: 전환 배너(있을 때) + 본문 영역; 배너는 문서 흐름이라 메뉴를 덮지 않음 */}
      <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
        <ImpersonationBanner />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 사이드바 - 데스크톱 */}
          <aside className="hidden md:flex flex-col w-64 lg:w-72 shrink-0 bg-white border-r border-gray-100 overflow-y-auto">
            <Sidebar allowedMenuKeys={allowedMenuKeys} />
          </aside>
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <Header allowedMenuKeys={allowedMenuKeys} />
            <main className="flex-1 overflow-y-auto">
              <div className="px-4 py-5 md:px-6 md:py-6 max-w-5xl mx-auto w-full">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </SessionProvider>
  );
}

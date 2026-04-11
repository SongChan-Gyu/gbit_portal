import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import AuditLogClient from "@/app/(main)/admin/audit-log/AuditLogClient";
import MenuPermEditor from "@/app/(main)/admin/menu-permissions/MenuPermEditor";
import DataEditorTab from "@/app/(main)/admin/system/DataEditorTab";
import ProductionWipeTab from "@/app/(main)/admin/system/ProductionWipeTab";
import { ALL_MENUS, DEFAULT_PERMISSIONS } from "@/lib/menuConfig";

export const metadata = { title: "시스템 설정 | GBIT Portal" };

const ROLES = ["STAFF","TEAM_LEAD","PM","ADMIN"] as const;

export default async function SystemPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  const user = session!.user as any;
  if (!["PM","ADMIN"].includes(user.role)) redirect("/dashboard");

  const { tab: tabRaw } = await searchParams;
  const tab = tabRaw ?? "audit";

  // 메뉴 권한 / DB 데이터 탭은 ADMIN만 접근 가능
  if ((tab === "permissions" || tab === "data" || tab === "wipe") && user.role !== "ADMIN") {
    redirect("/admin/system?tab=audit");
  }

  const perms = await (async () => {
    if (tab !== "permissions") return null;
    const config = await prisma.systemConfig.findUnique({ where: { key: "menuPermissions" } });
    const p: Record<string, string[]> = config ? JSON.parse(config.value) : { ...DEFAULT_PERMISSIONS };
    for (const role of ROLES) {
      if (!p[role]) p[role] = DEFAULT_PERMISSIONS[role] ?? [];
    }
    return p;
  })();

  const TABS = [
    { id: "audit", label: "감사 로그", adminOnly: false },
    { id: "permissions", label: "메뉴 권한", adminOnly: true },
    { id: "data", label: "DB 데이터", adminOnly: true },
    { id: "wipe", label: "운영 초기화", adminOnly: true },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">시스템 설정</h1>
        <p className="page-subtitle">시스템 작업 이력 감사 및 역할별 메뉴 접근 권한을 관리합니다.</p>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {TABS.filter(t => !t.adminOnly || user.role === "ADMIN").map((t) => (
          <a key={t.id} href={`?tab=${t.id}`}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </a>
        ))}
      </div>

      {/* ── 감사 로그 ──────────────────────────────────── */}
      {tab === "audit" && (
        <div>
          <p className="text-sm text-gray-500 mb-4">시스템에서 발생한 모든 주요 작업 이력을 확인합니다.</p>
          <AuditLogClient />
        </div>
      )}

      {/* ── 메뉴 권한 ──────────────────────────────────── */}
      {tab === "permissions" && perms && (
        <div>
          <p className="text-sm text-gray-500 mb-4">역할별로 접근 가능한 메뉴를 설정합니다. 변경 즉시 적용됩니다.</p>
          <MenuPermEditor
            menus={ALL_MENUS}
            perms={perms}
            roles={ROLES as unknown as string[]}
          />
        </div>
      )}

      {/* ── DB 데이터 (원본 테이블 조회·수정) ───────────── */}
      {tab === "data" && (
        <div>
          <DataEditorTab />
        </div>
      )}

      {tab === "wipe" && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            스크립트 <code className="text-xs bg-gray-100 px-1 rounded">scripts/production-wipe.ts</code> 와 동일한 범위로
            데이터를 정리합니다. 반드시 미리보기 후 실행하세요.
          </p>
          <ProductionWipeTab />
        </div>
      )}
    </div>
  );
}

import { redirect } from "next/navigation";

/** 예전 URL 호환: 귀속연도 관리 → 휴가 관리 > 휴가 할당 */
export default async function FiscalYearPage({ searchParams }: { searchParams: Promise<{ fy?: string }> }) {
  const { fy } = await searchParams;
  redirect(`/admin/leave-management?tab=allocations${fy ? `&fy=${fy}` : ""}`);
}

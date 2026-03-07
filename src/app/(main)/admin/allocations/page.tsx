import { redirect } from "next/navigation";

export const metadata = { title: "할당 관리 | HRM" };

export default async function AllocationsPage({
  searchParams,
}: { searchParams: Promise<{ empId?: string; fy?: string }> }) {
  const { empId, fy } = await searchParams;
  const params = new URLSearchParams({ tab: "allocations" });
  if (empId) params.set("empId", empId);
  if (fy)    params.set("fy",    fy);
  redirect(`/admin/leave-management?${params.toString()}`);
}

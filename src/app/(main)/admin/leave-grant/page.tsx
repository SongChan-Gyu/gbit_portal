import { redirect } from "next/navigation";

export default async function LeaveGrantPage({ searchParams }:{ searchParams:Promise<{ fy?:string }> }) {
  const { fy } = await searchParams;
  redirect(`/admin/leave-management?tab=overview${fy ? `&fy=${fy}` : ""}`);
}

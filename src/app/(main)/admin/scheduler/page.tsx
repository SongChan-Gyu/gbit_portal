import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SchedulerPanel from "./SchedulerPanel";

export const metadata = { title: "자동 스케줄러 | GBIT Portal" };

export default async function SchedulerPage() {
  redirect("/admin/leave-management?tab=scheduler");
}

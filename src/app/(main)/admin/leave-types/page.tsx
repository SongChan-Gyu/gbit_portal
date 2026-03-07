import { redirect } from "next/navigation";

export default async function LeaveTypesPage() {
  redirect("/admin/leave-settings?tab=types");
}

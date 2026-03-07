import { redirect } from "next/navigation";

export default async function MenuPermissionsPage() {
  redirect("/admin/system?tab=permissions");
}

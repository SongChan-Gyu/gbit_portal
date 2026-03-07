import { redirect } from "next/navigation";

export default async function TeamsPage() {
  redirect("/admin/organization?tab=teams");
}

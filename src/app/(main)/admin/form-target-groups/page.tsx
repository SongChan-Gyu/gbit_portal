import { redirect } from "next/navigation";

export default function LegacyFormTargetGroupsRedirect() {
  redirect("/admin/groups");
}

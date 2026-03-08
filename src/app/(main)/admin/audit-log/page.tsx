import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import AuditLogClient from "./AuditLogClient";

export const metadata = { title: "감사 로그 | GBIT Portal" };

export default async function AuditLogPage() {
  redirect("/admin/system?tab=audit");
}

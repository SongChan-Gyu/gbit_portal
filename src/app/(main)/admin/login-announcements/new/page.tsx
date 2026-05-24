import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginAnnouncementEditor from "../LoginAnnouncementEditor";

export const metadata = { title: "로그인 팝업 등록 | GBIT Portal" };

export default async function NewLoginAnnouncementPage() {
  const session = await auth();
  const user = session?.user as { role?: string } | undefined;
  if (!["PM", "ADMIN"].includes(user?.role ?? "")) redirect("/dashboard");

  return (
    <div className="max-w-3xl">
      <h1 className="page-title mb-6">로그인 팝업 등록</h1>
      <LoginAnnouncementEditor />
    </div>
  );
}

import { requireInternalPageSession } from "@/lib/internalPageGuard";
import SupportNewForm from "./SupportNewForm";

export const metadata = { title: "새 문의 | 1:1 | GBIT Portal" };

export default async function SupportNewPage() {
  await requireInternalPageSession();
  return <SupportNewForm />;
}

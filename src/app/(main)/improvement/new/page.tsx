import { requireInternalPageSession } from "@/lib/internalPageGuard";
import ImprovementNewForm from "./ImprovementNewForm";

export const metadata = { title: "새 글 | 개선·협의 | GBIT Portal" };

export default async function ImprovementNewPage() {
  await requireInternalPageSession();
  return <ImprovementNewForm />;
}

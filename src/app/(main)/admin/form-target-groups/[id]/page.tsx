import { redirect } from "next/navigation";

export default async function LegacyFormTargetGroupEditRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/groups/${id}`);
}

import { Skeleton } from "@/components/ui/Skeleton";

export default function ApplyLoading() {
  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

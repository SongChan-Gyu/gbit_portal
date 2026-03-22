import { Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex gap-4">
        <Skeleton className="h-24 flex-1 rounded-xl" />
        <Skeleton className="h-24 flex-1 rounded-xl" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

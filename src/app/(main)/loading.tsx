import { Skeleton } from "@/components/ui/Skeleton";

export default function MainLoading() {
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

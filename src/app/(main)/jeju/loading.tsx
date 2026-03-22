import { Skeleton } from "@/components/ui/Skeleton";

export default function JejuLoading() {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  );
}

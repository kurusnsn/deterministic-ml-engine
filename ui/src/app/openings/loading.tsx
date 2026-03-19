import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingOpenings() {
  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Skeleton key={idx} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

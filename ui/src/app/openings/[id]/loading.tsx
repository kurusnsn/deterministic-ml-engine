import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingOpeningLines() {
  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 bg-gray-50 space-y-6">
      <div className="flex flex-col lg:flex-row gap-6">
        <Skeleton className="h-[480px] w-full lg:w-[600px] rounded-xl" />
        <div className="w-full lg:w-[400px] space-y-3">
          <Skeleton className="h-6 w-48" />
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton key={idx} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

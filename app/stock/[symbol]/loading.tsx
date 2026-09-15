import { Skeleton } from "@/components/ui/skeleton";

export default function StockLoading() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 sm:px-6">
      <Skeleton className="h-44 w-full rounded-xl" />
      <Skeleton className="h-9 w-full max-w-lg rounded-lg" />
      <Skeleton className="h-[380px] w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[300px] w-full rounded-xl" />
        <Skeleton className="h-[300px] w-full rounded-xl" />
      </div>
    </div>
  );
}

import { AdminFormSkeleton, AdminCollapsibleTriggerSkeleton, AdminTableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <AdminFormSkeleton fields={5} />
      <AdminCollapsibleTriggerSkeleton />
      <AdminCollapsibleTriggerSkeleton />
      <div>
        <Skeleton className="mb-3 h-5 w-32" />
        <AdminTableSkeleton rows={6} />
      </div>
    </div>
  );
}
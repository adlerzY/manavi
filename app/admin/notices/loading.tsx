import { AdminFormSkeleton, AdminTableSkeleton } from "@/components/admin/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <AdminFormSkeleton fields={2} />
      <div>
        <Skeleton className="mb-2 h-5 w-32" />
        <AdminTableSkeleton rows={5} />
      </div>
    </div>
  );
}
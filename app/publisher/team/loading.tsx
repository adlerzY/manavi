import { AdminFormSkeleton, AdminTableSkeleton } from "@/components/admin/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <AdminFormSkeleton fields={2} />
      <AdminTableSkeleton rows={5} />
    </div>
  );
}
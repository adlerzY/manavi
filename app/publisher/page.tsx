import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { PublisherDashboard } from "@/components/publisher/publisher-dashboard";
import { StaffOverview } from "@/components/publisher/staff-overview";

export default async function PublisherDashboardPage() {
  const user = await getSessionUser();
  const context = await getPublisherContext(user);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-main">داشبورد ناشر</h1>
      {!context ? (
        <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-muted">
          حساب شما به هیچ ناشری متصل نیست.
        </div>
      ) : context.isOwner ? (
        <PublisherDashboard publisherId={context.publisherId} />
      ) : (
        <StaffOverview firstName={user?.firstName ?? ""} />
      )}
    </div>
  );
}
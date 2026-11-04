import { redirect } from "next/navigation";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TeamManager } from "@/components/publisher/team-manager";

export default async function PublisherTeamPage() {
  const user = await getSessionUser();
  const context = await getPublisherContext(user);

  if (!context) {
    if (user?.role !== "ADMIN") redirect("/publisher");
    return (
      <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-muted">
        حساب شما به هیچ ناشری متصل نیست.
      </div>
    );
  }
  if (!context.permissions.manageMembers) {
    return (
      <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-muted">
        فقط ناشر اصلی می‌تواند اعضای تیم را مدیریت کند.
      </div>
    );
  }

  const staff = await prisma.publisherStaff.findMany({
    where: { publisherId: context.publisherId },
    include: { user: { select: { firstName: true, username: true } } },
  });

    return <TeamManager initialStaff={staff} actorPermissions={context.permissions} isOwner={context.isOwner} />;
}
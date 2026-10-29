import type { CommentStatus } from "@prisma/client";
import { getAdminNavCounts } from "@/lib/admin-counts";
import { listPendingChapters } from "@/app/admin/actions/chapter-approval";
import { listPendingComics } from "@/app/admin/actions/comic-approval";
import { listReports } from "@/app/admin/actions/reports";
import {
  listCommentsAdmin,
  setCommentStatusAdmin,
  updateCommentContentAdmin,
  deleteCommentAdmin,
} from "@/app/admin/actions/comment-moderation";
import { PageTabs } from "@/components/ui/page-tabs";
import { ChapterApprovalQueue } from "@/components/admin/chapter-approval-queue";
import { ComicApprovalQueue } from "@/components/admin/comic-approval-queue";
import { ReportQueue } from "@/components/moderation/report-queue";
import { CommentModerationTable } from "@/components/moderation/comment-moderation-table";

const VALID_STATUSES: CommentStatus[] = ["PENDING", "APPROVED", "REJECTED"];

interface PageProps {
  searchParams: Promise<{ tab?: string; status?: string }>;
}

function badge(count: number): string {
  return count > 0 ? ` (${count.toLocaleString("fa-IR")})` : "";
}

async function ApprovalsTab() {
  const [chapters, comics] = await Promise.all([listPendingChapters(), listPendingComics()]);
  return (
    <div className="space-y-10">
      <p className="text-sm text-text-muted">عناوین و چپترهایی که توسط اعضای تیم بدون تیک آبی ارسال شده‌اند.</p>
      <div>
        <h2 className="mb-3 text-lg font-medium text-text-main">عناوین در انتظار تایید</h2>
        <ComicApprovalQueue initialComics={comics} />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-medium text-text-main">چپترها در انتظار تایید</h2>
        <ChapterApprovalQueue initialChapters={chapters} />
      </div>
    </div>
  );
}

async function ReportsTab() {
  const { reports, total } = await listReports({ status: "ACTIVE", page: 1 });
  return <ReportQueue initialReports={reports} initialTotal={total} />;
}

async function CommentsTab({ status }: { status?: CommentStatus }) {
  const { comments, total } = await listCommentsAdmin({ page: 1, status });
  return (
    <CommentModerationTable
      initialComments={comments}
      initialTotal={total}
      initialStatus={status}
      listAction={listCommentsAdmin}
      setStatusAction={setCommentStatusAdmin}
      updateContentAction={updateCommentContentAdmin}
      deleteAction={deleteCommentAdmin}
    />
  );
}

export default async function AdminModerationPage({ searchParams }: PageProps) {
  const { tab: tabParam, status: statusParam } = await searchParams;
  const tab = tabParam === "reports" || tabParam === "comments" ? tabParam : "approvals";
  const status = VALID_STATUSES.find((value) => value === statusParam);
  const counts = await getAdminNavCounts();

  const tabs = [
    { id: "approvals", label: `تایید محتوا${badge(counts.approvals)}`, href: "/admin/moderation" },
    { id: "reports", label: `گزارش‌ها${badge(counts.openReports)}`, href: "/admin/moderation?tab=reports" },
    { id: "comments", label: `نظرات${badge(counts.pendingComments)}`, href: "/admin/moderation?tab=comments" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-main">نظارت و گزارش‌ها</h1>
      <PageTabs tabs={tabs} active={tab} />
      {tab === "reports" ? <ReportsTab /> : tab === "comments" ? <CommentsTab status={status} /> : <ApprovalsTab />}
    </div>
  );
}
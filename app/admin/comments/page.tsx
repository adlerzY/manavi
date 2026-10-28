import type { CommentStatus } from "@prisma/client";
import { listCommentsAdmin, setCommentStatusAdmin, updateCommentContentAdmin, deleteCommentAdmin } from "@/app/admin/actions/comment-moderation";
import { CommentModerationTable } from "@/components/moderation/comment-moderation-table";

const VALID_STATUSES: CommentStatus[] = ["PENDING", "APPROVED", "REJECTED"];

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function AdminCommentsPage({ searchParams }: PageProps) {
  const { status: statusParam } = await searchParams;
  const status = VALID_STATUSES.find((value) => value === statusParam);

  const { comments, total } = await listCommentsAdmin({ page: 1, status });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-text-main">مدیریت نظرات</h1>
      <CommentModerationTable
        initialComments={comments}
        initialTotal={total}
        initialStatus={status}
        listAction={listCommentsAdmin}
        setStatusAction={setCommentStatusAdmin}
        updateContentAction={updateCommentContentAdmin}
        deleteAction={deleteCommentAdmin}
      />
    </div>
  );
}
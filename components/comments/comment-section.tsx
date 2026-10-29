"use client";

import { useState, type FormEvent } from "react";
import { createComment } from "@/app/actions/comments";
import { replyToComment } from "@/app/publisher/actions/comment-reply";
import { useTelegramAuth } from "@/components/providers/telegram-auth-provider";
import { titleLabel } from "@/lib/achievements";

interface CommentAuthor {
  firstName: string;
  lastName: string | null;
  username: string | null;
  activeTitle?: string | null;
}

interface ReplyData {
  id: string;
  content: string;
  isSpoiler: boolean;
  isStaffReply: boolean;
  createdAt: string;
  user: CommentAuthor;
}

interface CommentData extends ReplyData {
  replies: ReplyData[];
}

function AuthorTitle({ value }: { value?: string | null }) {
  const label = titleLabel(value);
  if (!label) return null;
  return <span className="mr-1.5 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">{label}</span>;
}

function authorName(user: CommentAuthor) {
  return user.username ? `@${user.username}` : `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`;
}

function SpoilerText({ content, isSpoiler }: { content: string; isSpoiler: boolean }) {
  const [revealed, setRevealed] = useState(false);
  if (!isSpoiler || revealed) {
    return <p className="text-sm text-text-main">{content}</p>;
  }
  return (
    <button onClick={() => setRevealed(true)} className="w-full rounded-md bg-background px-3 py-2 text-right text-sm text-text-muted">
      این نظر حاوی اسپویلر است — برای نمایش ضربه بزنید
      <span className="mt-1 block select-none blur-sm">{content}</span>
    </button>
  );
}

function ReplyForm({ commentId, onReplied }: { commentId: string; onReplied: (reply: ReplyData) => void }) {
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useTelegramAuth();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim() || pending) return;
    setPending(true);
    setError(null);

    const result = await replyToComment(commentId, content.trim());
    if (result.success) {
      onReplied({
        id: `reply-${Date.now()}`,
        content: content.trim(),
        isSpoiler: false,
        isStaffReply: true,
        createdAt: new Date().toISOString(),
        user: { firstName: user?.firstName ?? "تیم", lastName: user?.lastName ?? null, username: user?.username ?? null, activeTitle: user?.activeTitle ?? null },
      });
      setContent("");
    } else {
      setError(result.error ?? "خطا در ارسال پاسخ");
    }
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-center gap-2">
      <input value={content} onChange={(e) => setContent(e.target.value)} placeholder="پاسخ به عنوان تیم..." className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-text-main outline-none focus:border-primary" />
      <button type="submit" disabled={pending || !content.trim()} className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground disabled:opacity-50">ارسال</button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </form>
  );
}

export function CommentSection({ chapterId, initialComments, canReply }: { chapterId: string; initialComments: CommentData[]; canReply: boolean }) {
  const { user } = useTelegramAuth();
  const [comments, setComments] = useState(initialComments);
  const [content, setContent] = useState("");
  const [isSpoiler, setIsSpoiler] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!content.trim() || pending) return;

    setPending(true);
    setError(null);

    const optimisticComment: CommentData = {
      id: `optimistic-${Date.now()}`,
      content: content.trim(),
      isSpoiler,
      isStaffReply: false,
      createdAt: new Date().toISOString(),
      replies: [],
      user: { firstName: user?.firstName ?? "شما", lastName: user?.lastName ?? null, username: user?.username ?? null, activeTitle: user?.activeTitle ?? null },
    };

    setComments((prev) => [optimisticComment, ...prev]);
    setContent("");

    const result = await createComment({ chapterId, content: optimisticComment.content, isSpoiler });

    if (!result.success || !result.comment) {
      setComments((prev) => prev.filter((c) => c.id !== optimisticComment.id));
      setError(result.error ?? "ثبت نظر با خطا مواجه شد");
    } else {
      const confirmed = result.comment;
      setComments((prev) => prev.map((c) => (c.id === optimisticComment.id ? { ...c, id: confirmed.id, replies: [] } : c)));
    }

    setIsSpoiler(false);
    setPending(false);
  }

  function handleReplied(commentId: string, reply: ReplyData) {
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c)));
    setReplyOpenFor(null);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h2 className="mb-4 text-lg font-medium text-text-main">نظرات</h2>

      {user ? (
        <form onSubmit={handleSubmit} className="mb-6 space-y-2">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="نظر خود را بنویسید..." className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input type="checkbox" checked={isSpoiler} onChange={(e) => setIsSpoiler(e.target.checked)} />
              حاوی اسپویلر است
            </label>
            <button type="submit" disabled={pending || !content.trim()} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">ارسال</button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      ) : (
        <p className="mb-6 text-sm text-text-muted">برای ثبت نظر باید از داخل تلگرام وارد شوید.</p>
      )}

      <div className="space-y-3">
        {comments.length === 0 && <p className="text-sm text-text-muted">هنوز نظری ثبت نشده است.</p>}
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-md border border-border bg-surface p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center text-xs font-medium text-text-main">
                {authorName(comment.user)}
                <AuthorTitle value={comment.user.activeTitle} />
              </span>
              <span className="text-xs text-text-muted">{new Date(comment.createdAt).toLocaleDateString("fa-IR")}</span>
            </div>
            <SpoilerText content={comment.content} isSpoiler={comment.isSpoiler} />

            {comment.replies.length > 0 && (
              <div className="mt-3 space-y-2 border-r-2 border-primary/30 pr-3">
                {comment.replies.map((reply) => (
                  <div key={reply.id}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-xs font-medium text-primary">{authorName(reply.user)}</span>
                      <AuthorTitle value={reply.user.activeTitle} />
                      {reply.isStaffReply && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">تیم</span>}
                    </div>
                    <SpoilerText content={reply.content} isSpoiler={reply.isSpoiler} />
                  </div>
                ))}
              </div>
            )}

            {canReply && (
              <div className="mt-2">
                <button onClick={() => setReplyOpenFor(replyOpenFor === comment.id ? null : comment.id)} className="text-xs text-primary">پاسخ</button>
                {replyOpenFor === comment.id && <ReplyForm commentId={comment.id} onReplied={(reply) => handleReplied(comment.id, reply)} />}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
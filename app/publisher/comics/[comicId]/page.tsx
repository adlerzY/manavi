import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAllGenres } from "@/lib/genres";
import { averageScore } from "@/lib/rating";
import { APPROVAL_STATUS_LABELS, CHAPTER_STATUS_LABELS } from "@/lib/labels";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";
import { BackButton } from "@/components/navigation/back-button";
import { UploadChapterForm } from "@/components/admin/upload-chapter-form";
import { ChapterListManager } from "@/components/admin/chapter-list-manager";
import { ComicStaffManager } from "@/components/admin/comic-staff-manager";
import { PublisherEditComicForm } from "@/components/publisher/edit-comic-form";
import { ComicManageTabs } from "@/components/publisher/comic-manage-tabs";
import { listComicStaff } from "@/app/admin/actions/comic-staff";
import type { ChapterStatus } from "@prisma/client";

type TabId = "overview" | "chapters" | "staff" | "settings";

interface PageProps {
  params: Promise<{ comicId: string }>;
  searchParams: Promise<{ tab?: string; upload?: string }>;
}

const CHAPTER_BADGE_CLASSES: Record<ChapterStatus, string> = {
  PUBLISHED: "bg-primary/10 text-primary",
  PENDING_APPROVAL: "bg-accent/10 text-accent",
  SCHEDULED: "bg-border text-text-muted",
  DRAFT: "bg-border text-text-muted",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 text-center">
      <p className="text-xl font-semibold text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{label}</p>
    </div>
  );
}

export default async function PublisherComicDetailPage({ params, searchParams }: PageProps) {
  const { comicId } = await params;
  const { tab: tabParam, upload } = await searchParams;

  const user = await getSessionUser();
  const context = await getPublisherContext(user);
  if (!context) redirect("/publisher");

  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      coverImage: true,
      bannerImage: true,
      ageRating: true,
      readingMode: true,
      approvalStatus: true,
      rejectionNote: true,
      ratingCount: true,
      ratingTotal: true,
      license: { select: { publisherId: true } },
      genres: { select: { genreId: true } },
    },
  });
  if (!comic) notFound();
  if (comic.license.publisherId !== context.publisherId) redirect("/publisher/comics");

  const availableTabs: TabId[] = context.canManageComics
    ? ["overview", "chapters", "staff", "settings"]
    : ["overview", "chapters"];
  const tab: TabId = availableTabs.includes(tabParam as TabId) ? (tabParam as TabId) : "overview";

  const statusGroups = await prisma.chapter.groupBy({
    by: ["status"],
    where: { comicId },
    _count: { _all: true },
  });
  const countByStatus = new Map(statusGroups.map((group) => [group.status, group._count._all]));
  const totalChapters = statusGroups.reduce((sum, group) => sum + group._count._all, 0);

  const [viewAggregate, bookmarkCount, recentChapters] =
    tab === "overview"
      ? await Promise.all([
          prisma.chapter.aggregate({ where: { comicId }, _sum: { viewCount: true } }),
          prisma.bookmark.count({ where: { comicId } }),
          prisma.chapter.findMany({
            where: { comicId },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, chapterNumber: true, title: true, status: true, createdAt: true },
          }),
        ])
      : [null, 0, []];

  const chapters =
    tab === "chapters"
      ? await prisma.chapter.findMany({
          where: { comicId },
          orderBy: { chapterNumber: "desc" },
          select: {
            id: true,
            chapterNumber: true,
            title: true,
            status: true,
            scheduledAt: true,
            isLocked: true,
            accessType: true,
          },
        })
      : [];

  const comicStaff = tab === "staff" && context.canManageComics ? await listComicStaff(comicId) : [];
  const genres = tab === "settings" && context.canManageComics ? await getAllGenres() : [];

  const base = `/publisher/comics/${comicId}`;
  const tabLabels: Record<TabId, { label: string; href: string }> = {
    overview: { label: "نمای کلی", href: base },
    chapters: { label: `چپترها (${totalChapters.toLocaleString("fa-IR")})`, href: `${base}?tab=chapters` },
    staff: { label: "دست‌اندرکاران", href: `${base}?tab=staff` },
    settings: { label: "اطلاعات و تنظیمات", href: `${base}?tab=settings` },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton fallbackHref="/publisher/comics" variant="plain" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-text-main">{comic.title}</h1>
            <p className="mt-0.5 text-xs text-text-muted">{APPROVAL_STATUS_LABELS[comic.approvalStatus]}</p>
          </div>
        </div>
        <Link
          href={`${base}?tab=chapters&upload=1`}
          className="flex min-h-11 items-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          آپلود چپتر جدید
        </Link>
      </div>

      <ComicManageTabs
        active={tab}
        tabs={availableTabs.map((id) => ({ id, label: tabLabels[id].label, href: tabLabels[id].href }))}
      />

      {tab === "overview" && (
        <div className="space-y-6">
          {comic.approvalStatus === "PENDING_APPROVAL" && (
            <p className="rounded-md border border-accent bg-accent/10 px-4 py-3 text-sm text-accent">در انتظار تایید ادمین</p>
          )}
          {comic.approvalStatus === "NEEDS_CHANGES" && (
            <p className="rounded-md border border-red-400 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              نیاز به اصلاح — یادداشت: {comic.rejectionNote ?? "—"}
            </p>
          )}

          <div className="flex items-start gap-4">
            <div className="relative h-36 w-24 flex-shrink-0 overflow-hidden rounded-md bg-surface">
              <SafeCoverImage src={comic.coverImage} alt={comic.title} fill sizes="96px" className="object-cover" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="line-clamp-4 text-sm leading-7 text-text-muted">{comic.description}</p>
              {comic.ratingCount > 0 && (
                <p className="text-xs text-text-muted">
                  ★ {averageScore(comic.ratingTotal, comic.ratingCount).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} (
                  {comic.ratingCount.toLocaleString("fa-IR")} رأی)
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {comic.approvalStatus === "APPROVED" && (
                  <Link href={`/app/comic/${comic.slug}`} className="flex min-h-11 items-center rounded-md border border-border px-3 text-xs text-text-main hover:border-primary">
                    مشاهده در اپ
                  </Link>
                )}
                {context.canManageComics && (
                  <Link href={`${base}?tab=settings`} className="flex min-h-11 items-center rounded-md border border-border px-3 text-xs text-text-main hover:border-primary">
                    ویرایش اطلاعات
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="چپتر منتشرشده" value={(countByStatus.get("PUBLISHED") ?? 0).toLocaleString("fa-IR")} />
            <Stat label="در انتظار تایید" value={(countByStatus.get("PENDING_APPROVAL") ?? 0).toLocaleString("fa-IR")} />
            <Stat
              label="پیش‌نویس و زمان‌بندی"
              value={((countByStatus.get("DRAFT") ?? 0) + (countByStatus.get("SCHEDULED") ?? 0)).toLocaleString("fa-IR")}
            />
            <Stat label="بازدید کل" value={(viewAggregate?._sum.viewCount ?? 0).toLocaleString("fa-IR")} />
            <Stat label="بوکمارک" value={bookmarkCount.toLocaleString("fa-IR")} />
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-main">آخرین چپترها</h2>
              <Link href={`${base}?tab=chapters`} className="text-xs text-primary">
                مدیریت چپترها
              </Link>
            </div>
            <div className="divide-y divide-border rounded-md border border-border">
              {recentChapters.map((chapter) => (
                <div key={chapter.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-main">
                      چپتر {chapter.chapterNumber.toLocaleString("fa-IR")}
                      {chapter.title ? ` — ${chapter.title}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">{chapter.createdAt.toLocaleDateString("fa-IR")}</p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs ${CHAPTER_BADGE_CLASSES[chapter.status]}`}>
                    {CHAPTER_STATUS_LABELS[chapter.status]}
                  </span>
                </div>
              ))}
              {recentChapters.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">هنوز چپتری آپلود نشده است.</p>}
            </div>
          </section>
        </div>
      )}

      {tab === "chapters" && (
        <div className="space-y-6">
          <CollapsibleSection key={upload === "1" ? "upload-open" : "upload-closed"} triggerLabel="آپلود چپتر جدید" defaultOpen={upload === "1"}>
            <UploadChapterForm comics={[{ id: comic.id, title: comic.title }]} restrictAccessTypes />
          </CollapsibleSection>

          <ChapterListManager
            restrictAccessTypes
            chapters={chapters.map((ch) => ({
              id: ch.id,
              chapterNumber: ch.chapterNumber,
              title: ch.title,
              status: ch.status,
              scheduledAt: ch.scheduledAt ? ch.scheduledAt.toISOString() : null,
              isLocked: ch.isLocked,
              accessType: ch.accessType,
            }))}
          />
        </div>
      )}

      {tab === "staff" && context.canManageComics && <ComicStaffManager comicId={comic.id} initialStaff={comicStaff} />}

      {tab === "settings" && context.canManageComics && (
        <PublisherEditComicForm
          comic={comic}
          genres={genres.map((g) => ({ id: g.id, name: g.name }))}
          initialGenreIds={comic.genres.map((g) => g.genreId)}
        />
      )}
    </div>
  );
}
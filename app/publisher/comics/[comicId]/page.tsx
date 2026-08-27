import { notFound, redirect } from "next/navigation";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAllGenres } from "@/lib/genres";
import type { GenreOption } from "@/lib/genres";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { UploadChapterForm } from "@/components/admin/upload-chapter-form";
import { ChapterListManager } from "@/components/admin/chapter-list-manager";
import { ComicStaffManager } from "@/components/admin/comic-staff-manager";
import { PublisherEditComicForm } from "@/components/publisher/edit-comic-form";
import { listComicStaff, type ComicStaffRow } from "@/app/admin/actions/comic-staff";

interface PageProps {
  params: Promise<{ comicId: string }>;
}

export default async function PublisherComicDetailPage({ params }: PageProps) {
  const { comicId } = await params;
  const user = await getSessionUser();
  const context = await getPublisherContext(user);
  if (!context) redirect("/publisher");

  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: {
      id: true,
      title: true,
      description: true,
      coverImage: true,
      bannerImage: true,
      ageRating: true,
      readingMode: true,
      approvalStatus: true,
      rejectionNote: true,
      license: { select: { publisherId: true } },
      genres: { select: { genreId: true } },
      chapters: {
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
      },
    },
  });
  if (!comic) notFound();
  if (comic.license.publisherId !== context.publisherId) redirect("/publisher/comics");

  let genres: GenreOption[] = [];
  let comicStaff: ComicStaffRow[] = [];
  if (context.canManageComics) {
    [genres, comicStaff] = await Promise.all([getAllGenres(), listComicStaff(comic.id)]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-main">{comic.title}</h1>
        {comic.approvalStatus === "PENDING_APPROVAL" && (
          <p className="mt-1 text-xs text-accent">در انتظار تایید ادمین</p>
        )}
        {comic.approvalStatus === "NEEDS_CHANGES" && (
          <p className="mt-1 text-xs text-red-400">نیاز به اصلاح — یادداشت: {comic.rejectionNote ?? "—"}</p>
        )}
      </div>

      {context.canManageComics && (
        <>
          <CollapsibleSection triggerLabel="ویرایش اطلاعات عنوان">
            <PublisherEditComicForm
              comic={comic}
              genres={genres.map((g) => ({ id: g.id, name: g.name }))}
              initialGenreIds={comic.genres.map((g) => g.genreId)}
            />
          </CollapsibleSection>

          <CollapsibleSection triggerLabel="مدیریت دست‌اندرکاران">
            <ComicStaffManager comicId={comic.id} initialStaff={comicStaff} />
          </CollapsibleSection>
        </>
      )}

      <CollapsibleSection triggerLabel="آپلود چپتر جدید">
        <UploadChapterForm comics={[{ id: comic.id, title: comic.title }]} restrictAccessTypes />
      </CollapsibleSection>

      <div className="space-y-2">
        <h2 className="text-lg font-medium text-text-main">چپترها</h2>
        <ChapterListManager
          restrictAccessTypes
          chapters={comic.chapters.map((ch) => ({
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
    </div>
  );
}
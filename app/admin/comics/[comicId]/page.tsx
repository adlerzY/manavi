import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAllGenres } from "@/lib/genres";
import { getAllCategories } from "@/lib/categories";
import { buildLicenseOptions, PLATFORM_PUBLISHER_ID } from "@/lib/platform-license";
import { ensureDefaultEdition } from "@/lib/editions";
import { getActiveLanguages, getLanguageLabels } from "@/lib/language-registry";
import { languageLabel } from "@/lib/languages";
import { listComicEditions } from "@/app/admin/actions/editions";
import { listComicStaff } from "@/app/admin/actions/comic-staff";
import { getComicAccessOverview } from "@/app/admin/actions/access";
import { getBonusOverview } from "@/app/admin/actions/bonuses";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";
import { EditComicForm } from "@/components/admin/edit-comic-form";
import { ComicStaffManager } from "@/components/admin/comic-staff-manager";
import { ComicAccessManager } from "@/components/admin/comic-access-manager";
import { ChapterListManager } from "@/components/admin/chapter-list-manager";
import { UploadChapterForm } from "@/components/admin/upload-chapter-form";
import { EditionManager } from "@/components/admin/edition-manager";
import { BonusManager } from "@/components/admin/bonus-manager";
import { ComicDeleteButton } from "@/components/admin/comic-delete-button";
import { BackButton } from "@/components/navigation/back-button";

interface PageProps {
  params: Promise<{ comicId: string }>;
}

export default async function AdminComicDetailPage({ params }: PageProps) {
  const { comicId } = await params;

  await ensureDefaultEdition(comicId);

  const [comic, licenses, genres, categories, comicStaff, accessOverview, publishers, editionRows, activeLanguages, languageLabels, bonusOverview] = await Promise.all([
    prisma.comic.findUnique({
      where: { id: comicId },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        coverImage: true,
        bannerImage: true,
        licenseId: true,
        ageRating: true,
        categoryId: true,
        readingMode: true,
        isFeaturedOnHome: true,
        featuredBadge: true,
        genres: { select: { genreId: true } },
        chapters: {
          where: { deletedAt: null },
          orderBy: { chapterNumber: "desc" },
          select: {
            id: true,
            chapterNumber: true,
            title: true,
            status: true,
            scheduledAt: true,
            isLocked: true,
            accessType: true,
            edition: { select: { language: true, publisher: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.license.findMany({
      where: { status: { notIn: ["EXPIRED", "TERMINATED"] } },
      include: { publisher: { select: { name: true } } },
    }),
    getAllGenres(),
    getAllCategories(),
    listComicStaff(comicId),
    getComicAccessOverview(comicId),
    prisma.publisher.findMany({
      where: { id: { not: PLATFORM_PUBLISHER_ID } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listComicEditions(comicId),
    getActiveLanguages(),
    getLanguageLabels(),
    getBonusOverview(comicId),
  ]);

  if (!comic) {
    notFound();
  }

  const licenseOptions = buildLicenseOptions(licenses);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton fallbackHref="/admin/comics" variant="plain" />
          <div className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded-md bg-surface">
            <SafeCoverImage src={comic.coverImage} alt={comic.title} fill sizes="56px" className="object-cover" />
          </div>
          <h1 className="min-w-0 truncate text-xl font-semibold text-text-main">{comic.title}</h1>
        </div>
        <ComicDeleteButton comicId={comic.id} comicTitle={comic.title} />
      </div>

      <CollapsibleSection triggerLabel="ویرایش اطلاعات عنوان" defaultOpen>
        <EditComicForm
          comic={comic}
          licenses={licenseOptions}
          genres={genres.map((g) => ({ id: g.id, name: g.name }))}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            defaultReadingMode: c.defaultReadingMode,
          }))}
          initialGenreIds={comic.genres.map((g) => g.genreId)}
        />
      </CollapsibleSection>

      <CollapsibleSection triggerLabel="مدیریت دست‌اندرکاران">
        <ComicStaffManager comicId={comic.id} initialStaff={comicStaff} />
      </CollapsibleSection>

      {accessOverview && (
        <CollapsibleSection triggerLabel="دسترسی، مالکیت و قفل اضطراری">
          <ComicAccessManager comicId={comic.id} overview={accessOverview} publishers={publishers} />
        </CollapsibleSection>
      )}

      <CollapsibleSection triggerLabel="نسخه‌ها و زبان‌ها" defaultOpen>
        <EditionManager
          comicId={comic.id}
          editions={editionRows}
          languages={activeLanguages.map((item) => ({ code: item.code, label: item.label }))}
          isAdmin
          autoApprove
          publishers={publishers}
          licenses={licenses.map((item) => ({
            id: item.id,
            publisherId: item.publisherId,
            label: `${item.publisher.name} — ${item.territory.join("/")} (${item.status})`,
          }))}
        />
      </CollapsibleSection>

      <CollapsibleSection triggerLabel="بونس نسخه‌ها و کمپین‌ها">
        <BonusManager comicId={comic.id} overview={bonusOverview} isAdmin />
      </CollapsibleSection>

      <CollapsibleSection triggerLabel="آپلود چپتر جدید">
        <UploadChapterForm
          comics={[{ id: comic.id, title: comic.title }]}
          editions={editionRows
            .filter((item) => item.status !== "SUSPENDED" && item.status !== "ARCHIVED")
            .map((item) => ({ id: item.id, label: `${item.publisherName} · ${item.languageLabel}` }))}
        />
      </CollapsibleSection>

      <div className="space-y-4">
        <h2 className="text-lg font-medium text-text-main">
          چپترها ({comic.chapters.length.toLocaleString("fa-IR")})
        </h2>
        <ChapterListManager
          chapters={comic.chapters.map((ch) => ({
            id: ch.id,
            chapterNumber: ch.chapterNumber,
            title: ch.title,
            status: ch.status,
            scheduledAt: ch.scheduledAt ? ch.scheduledAt.toISOString() : null,
            isLocked: ch.isLocked,
            accessType: ch.accessType,
            editionLabel: `${ch.edition.publisher.name} · ${languageLabel(ch.edition.language, languageLabels)}`,
          }))}
        />
      </div>
    </div>
  );
}

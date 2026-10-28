import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAllGenres } from "@/lib/genres";
import { getAllCategories } from "@/lib/categories";
import { LICENSE_STATUS_LABELS_FA } from "@/lib/license";
import { APPROVAL_STATUS_LABELS } from "@/lib/labels";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { PublisherCreateComicForm } from "@/components/publisher/create-comic-form";
import { PublisherComicRow } from "@/components/publisher/comic-row";
import type { ComicApprovalStatus, ComicStatus, Prisma } from "@prisma/client";

const PAGE_SIZE = 30;
const APPROVAL_VALUES: ComicApprovalStatus[] = ["APPROVED", "PENDING_APPROVAL", "NEEDS_CHANGES"];

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; approval?: string; page?: string }>;
}

interface ComicChapterStats {
  total: number;
  published: number;
  pending: number;
  lastPublishedAt: Date | null;
}

export default async function PublisherComicsPage({ searchParams }: PageProps) {
  const { q, status: statusParam, approval: approvalParam, page: pageParam } = await searchParams;
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

  const query = q?.trim();
  const page = Math.max(1, Number(pageParam) || 1);
  const status = (
    statusParam === "ONGOING" || statusParam === "COMPLETED" || statusParam === "HIATUS" ? statusParam : undefined
  ) as ComicStatus | undefined;
  const approval = APPROVAL_VALUES.find((value) => value === approvalParam);

  const where: Prisma.ComicWhereInput = {
    license: { publisherId: context.publisherId },
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { slug: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(approval ? { approvalStatus: approval } : {}),
  };

  const [comics, total, genres, categories] = await Promise.all([
    prisma.comic.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        coverImage: true,
        dominantColor: true,
        status: true,
        approvalStatus: true,
        license: { select: { status: true } },
      },
    }),
    prisma.comic.count({ where }),
    getAllGenres(),
    getAllCategories(),
  ]);

  const comicIds = comics.map((c) => c.id);
  const chapterGroups = comicIds.length
    ? await prisma.chapter.groupBy({
        by: ["comicId", "status"],
        where: { comicId: { in: comicIds } },
        _count: { _all: true },
        _max: { publishedAt: true },
      })
    : [];

  const statsByComic = new Map<string, ComicChapterStats>();
  for (const group of chapterGroups) {
    const stats = statsByComic.get(group.comicId) ?? { total: 0, published: 0, pending: 0, lastPublishedAt: null };
    stats.total += group._count._all;
    if (group.status === "PUBLISHED") stats.published += group._count._all;
    if (group.status === "PENDING_APPROVAL") stats.pending += group._count._all;
    const last = group._max.publishedAt;
    if (last && (!stats.lastPublishedAt || last > stats.lastPublishedAt)) stats.lastPublishedAt = last;
    statsByComic.set(group.comicId, stats);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(overrides: { page?: number }): string {
    const qp = new URLSearchParams();
    if (query) qp.set("q", query);
    if (status) qp.set("status", status);
    if (approval) qp.set("approval", approval);
    const nextPage = overrides.page ?? 1;
    if (nextPage > 1) qp.set("page", String(nextPage));
    const qs = qp.toString();
    return `/publisher/comics${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-text-main">آثار من</h1>

      {context.canManageComics && (
        <CollapsibleSection triggerLabel="افزودن عنوان جدید">
          <PublisherCreateComicForm
            genres={genres.map((g) => ({ id: g.id, name: g.name }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name, defaultReadingMode: c.defaultReadingMode }))}
          />
        </CollapsibleSection>
      )}

      <form className="flex flex-wrap gap-2">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="جستجوی عنوان یا اسلاگ..."
          className="min-h-11 min-w-[200px] flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-main outline-none focus:border-primary"
        />
        <select name="status" defaultValue={status ?? ""} className="min-h-11 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-main">
          <option value="">همه وضعیت‌های انتشار</option>
          <option value="ONGOING">در حال انتشار</option>
          <option value="COMPLETED">پایان‌یافته</option>
          <option value="HIATUS">متوقف‌شده</option>
        </select>
        <select name="approval" defaultValue={approval ?? ""} className="min-h-11 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-main">
          <option value="">همه وضعیت‌های تایید</option>
          {APPROVAL_VALUES.map((value) => (
            <option key={value} value={value}>{APPROVAL_STATUS_LABELS[value]}</option>
          ))}
        </select>
        <button className="min-h-11 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">جستجو</button>
        {(query || status || approval) && (
          <Link href="/publisher/comics" className="flex min-h-11 items-center rounded-md border border-border px-4 py-1.5 text-sm text-text-muted">
            پاک کردن
          </Link>
        )}
      </form>

      <div className="space-y-2">
        {comics.map((comic) => {
          const stats = statsByComic.get(comic.id);
          return (
            <PublisherComicRow
              key={comic.id}
              id={comic.id}
              title={comic.title}
              coverImage={comic.coverImage}
              dominantColor={comic.dominantColor}
              approvalStatus={comic.approvalStatus}
              comicStatus={comic.status}
              licenseLabel={LICENSE_STATUS_LABELS_FA[comic.license.status]}
              publishedCount={stats?.published ?? 0}
              totalCount={stats?.total ?? 0}
              pendingCount={stats?.pending ?? 0}
              lastPublishedAt={stats?.lastPublishedAt ?? null}
            />
          );
        })}
        {comics.length === 0 && (
          <p className="rounded-md border border-border bg-surface px-4 py-6 text-center text-sm text-text-muted">موردی یافت نشد.</p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <Link href={buildHref({ page: page - 1 })} className={`rounded-md border border-border px-3 py-2 ${page <= 1 ? "pointer-events-none opacity-30" : "hover:border-primary"}`}>قبلی</Link>
          <span>صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span>
          <Link href={buildHref({ page: page + 1 })} className={`rounded-md border border-border px-3 py-2 ${page >= totalPages ? "pointer-events-none opacity-30" : "hover:border-primary"}`}>بعدی</Link>
        </div>
      )}
    </div>
  );
}
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAllGenres } from "@/lib/genres";
import { getAllCategories } from "@/lib/categories";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { PublisherCreateComicForm } from "@/components/publisher/create-comic-form";
import { ComicStatus, Prisma } from "@prisma/client";

const PAGE_SIZE = 30;

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}

export default async function PublisherComicsPage({ searchParams }: PageProps) {
  const { q, status: statusParam, page: pageParam } = await searchParams;
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
    statusParam === "ONGOING" || statusParam === "COMPLETED" || statusParam === "HIATUS"
      ? statusParam
      : undefined
  ) as ComicStatus | undefined;

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
        slug: true,
        approvalStatus: true,
        license: { select: { status: true } },
        _count: { select: { chapters: true } },
      },
    }),
    prisma.comic.count({ where }),
    getAllGenres(),
    getAllCategories(),
  ]);

  const comicIds = comics.map((c) => c.id);
  const publishedCounts = comicIds.length
    ? await prisma.chapter.groupBy({
        by: ["comicId"],
        where: { comicId: { in: comicIds }, publishedAt: { not: null } },
        _count: { _all: true },
      })
    : [];
  const publishedByComicId = new Map(publishedCounts.map((p) => [p.comicId, p._count._all]));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildHref(overrides: { q?: string; status?: string; page?: number }): string {
    const qp = new URLSearchParams();
    const nextQ = overrides.q !== undefined ? overrides.q : query;
    const nextStatus = overrides.status !== undefined ? overrides.status : status;
    const nextPage = overrides.page ?? 1;
    if (nextQ) qp.set("q", nextQ);
    if (nextStatus) qp.set("status", nextStatus);
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
          className="min-w-[200px] flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-main outline-none focus:border-primary"
        />
        <select name="status" defaultValue={status ?? ""} className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-main">
          <option value="">همه وضعیت‌ها</option>
          <option value="ONGOING">در حال انتشار</option>
          <option value="COMPLETED">پایان‌یافته</option>
          <option value="HIATUS">متوقف‌شده</option>
        </select>
        <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">جستجو</button>
        {(query || status) && (
          <Link href="/publisher/comics" className="rounded-md border border-border px-3 py-1.5 text-sm text-text-muted">
            پاک کردن
          </Link>
        )}
      </form>

      <div className="divide-y divide-border rounded-md border border-border">
        {comics.map((c) => (
          <Link key={c.id} href={`/publisher/comics/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-background">
            <div className="flex items-center gap-2">
              <p className="text-sm text-text-main">{c.title}</p>
              {c.approvalStatus !== "APPROVED" && (
                <span className="text-xs text-accent">
                  {c.approvalStatus === "NEEDS_CHANGES" ? "نیاز به اصلاح" : "در انتظار تایید"}
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted">
              {c.license.status} · {(publishedByComicId.get(c.id) ?? 0).toLocaleString("fa-IR")}/{c._count.chapters.toLocaleString("fa-IR")} چپتر منتشرشده
            </p>
          </Link>
        ))}
        {comics.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">موردی یافت نشد.</p>}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <Link href={buildHref({ page: page - 1 })} className={`rounded-md border border-border px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-30" : "hover:border-primary"}`}>قبلی</Link>
          <span>صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span>
          <Link href={buildHref({ page: page + 1 })} className={`rounded-md border border-border px-3 py-1.5 ${page >= totalPages ? "pointer-events-none opacity-30" : "hover:border-primary"}`}>بعدی</Link>
        </div>
      )}
    </div>
  );
}